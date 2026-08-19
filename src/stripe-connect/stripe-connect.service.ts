import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  STRIPE_CONNECT_PROVIDER,
  type ConnectedAccountStatus,
  type StripeConnectProvider,
  type StripeOnboardingLink,
  isConnectedAccountUnavailableError,
} from './stripe-connect.provider';

@Injectable()
export class StripeConnectService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CONNECT_PROVIDER)
    private readonly stripeProvider: StripeConnectProvider,
  ) {}

  async getStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        name: true,
        stripeAccountId: true,
        stripeConnections: {
          where: { state: 'REPLACEMENT_PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { providerAccountId: true },
        },
      },
    });
    const checkedAt = new Date().toISOString();
    const pendingReplacement = workspace.stripeConnections[0];
    let replacement: ReturnType<StripeConnectService['presentAccount']> | null =
      null;
    if (pendingReplacement) {
      try {
        replacement = this.presentAccount(
          pendingReplacement.providerAccountId,
          await this.stripeProvider.getAccountStatus(
            pendingReplacement.providerAccountId,
          ),
          workspace.name,
        );
      } catch (error: unknown) {
        if (!isConnectedAccountUnavailableError(error)) throw error;
        await this.markAccountUnavailable(
          workspaceId,
          pendingReplacement.providerAccountId,
        );
      }
    }

    if (!workspace.stripeAccountId) {
      const disconnectedConnection =
        await this.prisma.stripeConnection.findFirst({
          where: { workspaceId, state: 'DISCONNECTED' },
          select: { id: true },
        });
      return {
        connected: false,
        onboardingComplete: false,
        paymentsReady: false,
        account: null,
        replacement,
        connectionIssue: disconnectedConnection
          ? ('ACCOUNT_UNAVAILABLE' as const)
          : null,
        checkedAt,
      };
    }

    await this.ensureConnectionRecord(workspaceId, workspace.stripeAccountId);
    let status: ConnectedAccountStatus;
    try {
      status = await this.stripeProvider.getAccountStatus(
        workspace.stripeAccountId,
      );
    } catch (error: unknown) {
      if (!isConnectedAccountUnavailableError(error)) throw error;
      await this.markAccountUnavailable(workspaceId, workspace.stripeAccountId);

      return {
        connected: false,
        onboardingComplete: false,
        paymentsReady: false,
        account: null,
        replacement,
        connectionIssue: 'ACCOUNT_UNAVAILABLE' as const,
        checkedAt,
      };
    }

    return {
      connected: true,
      onboardingComplete: status.onboardingComplete,
      paymentsReady: status.paymentsReady,
      account: this.presentAccount(
        workspace.stripeAccountId,
        status,
        workspace.name,
      ),
      replacement,
      connectionIssue: null,
      checkedAt,
    };
  }

  async startOnboarding(workspaceId: string): Promise<StripeOnboardingLink> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        stripeAccountId: true,
        stripeConnections: {
          where: {
            state: { in: ['DISCONNECTED', 'REPLACED', 'ABANDONED'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    let accountId = workspace.stripeAccountId;

    if (!accountId) {
      const previousConnectionId =
        workspace.stripeConnections[0]?.id ?? 'initial';
      const account = await this.stripeProvider.createAccount(workspaceId, {
        idempotencyKey: `stripe-connect-account-v3:${workspaceId}:after:${previousConnectionId}`,
      });
      accountId = account.id;

      try {
        await this.prisma.$transaction([
          this.prisma.stripeConnection.create({
            data: {
              providerAccountId: accountId,
              state: 'ACTIVE',
              activatedAt: new Date(),
              workspace: { connect: { id: workspaceId } },
            },
          }),
          this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { stripeAccountId: accountId },
          }),
        ]);
      } catch (error: unknown) {
        if (!this.isUniqueConstraintError(error)) throw error;

        const currentWorkspace = await this.prisma.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          select: { stripeAccountId: true },
        });
        if (currentWorkspace.stripeAccountId !== accountId) {
          throw new ConflictException(
            'Stripe account is already connected to another workspace',
          );
        }
      }
    } else {
      await this.ensureConnectionRecord(workspaceId, accountId);
    }

    let onboardingLink: StripeOnboardingLink;
    try {
      onboardingLink = await this.stripeProvider.createOnboardingLink(
        accountId,
        'initial',
      );
    } catch (error: unknown) {
      if (!isConnectedAccountUnavailableError(error)) throw error;
      await this.markAccountUnavailable(workspaceId, accountId);
      return this.startOnboarding(workspaceId);
    }

    return { url: onboardingLink.url };
  }

  async createDashboardLink(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { stripeAccountId: true },
    });

    if (!workspace.stripeAccountId) {
      throw new BadRequestException('Connect Stripe before opening it');
    }
    if (!this.stripeProvider.createLoginLink) {
      throw new NotImplementedException(
        'Stripe account management is not available',
      );
    }

    try {
      return await this.stripeProvider.createLoginLink(
        workspace.stripeAccountId,
      );
    } catch (error: unknown) {
      if (!isConnectedAccountUnavailableError(error)) throw error;
      await this.markAccountUnavailable(workspaceId, workspace.stripeAccountId);
      throw new ConflictException(
        'Stripe connection ended. Connect another account.',
      );
    }
  }

  async startReplacement(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        stripeAccountId: true,
        stripeConnections: {
          where: { state: 'REPLACEMENT_PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { providerAccountId: true },
        },
      },
    });

    if (!workspace.stripeAccountId) {
      throw new BadRequestException(
        'Connect a Stripe account before replacing it',
      );
    }

    await this.ensureConnectionRecord(workspaceId, workspace.stripeAccountId);
    let accountId = workspace.stripeConnections[0]?.providerAccountId;

    if (!accountId) {
      const currentStatus = await this.stripeProvider.getAccountStatus(
        workspace.stripeAccountId,
      );
      const account = await this.stripeProvider.createAccount(workspaceId, {
        idempotencyKey: `stripe-connect-replacement:${workspaceId}:${randomUUID()}`,
        country: currentStatus.country ?? undefined,
      });
      accountId = account.id;

      try {
        await this.prisma.stripeConnection.create({
          data: {
            providerAccountId: accountId,
            state: 'REPLACEMENT_PENDING',
            workspace: { connect: { id: workspaceId } },
          },
        });
      } catch (error: unknown) {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException(
            'Stripe account is already connected to another workspace',
          );
        }
        throw error;
      }
    }

    return this.stripeProvider.createOnboardingLink(accountId, 'replacement');
  }

  async activateReplacement(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        stripeAccountId: true,
        stripeConnections: {
          where: { state: 'REPLACEMENT_PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, providerAccountId: true },
        },
      },
    });
    const replacement = workspace.stripeConnections[0];

    if (!workspace.stripeAccountId || !replacement) {
      throw new BadRequestException('No Stripe replacement is waiting');
    }

    const status = await this.stripeProvider.getAccountStatus(
      replacement.providerAccountId,
    );
    if (!status.onboardingComplete || !status.paymentsReady) {
      throw new ConflictException(
        'Finish Stripe verification before using this account',
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.stripeConnection.updateMany({
        where: { workspaceId, state: 'ACTIVE' },
        data: { state: 'REPLACED', deactivatedAt: now },
      }),
      this.prisma.stripeConnection.update({
        where: { id: replacement.id },
        data: { state: 'ACTIVE', activatedAt: now },
      }),
      this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { stripeAccountId: replacement.providerAccountId },
      }),
    ]);

    return { activated: true };
  }

  async cancelReplacement(workspaceId: string) {
    const replacement = await this.prisma.stripeConnection.findFirst({
      where: { workspaceId, state: 'REPLACEMENT_PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!replacement) {
      throw new BadRequestException('No Stripe replacement is waiting');
    }

    await this.prisma.stripeConnection.update({
      where: { id: replacement.id },
      data: { state: 'ABANDONED', deactivatedAt: new Date() },
    });

    return { cancelled: true };
  }

  private async ensureConnectionRecord(
    workspaceId: string,
    providerAccountId: string,
  ) {
    const existing = await this.prisma.stripeConnection.findUnique({
      where: { providerAccountId },
      select: { workspaceId: true },
    });

    if (existing) {
      if (existing.workspaceId !== workspaceId) {
        throw new ConflictException(
          'Stripe account is already connected to another workspace',
        );
      }
      return;
    }

    await this.prisma.stripeConnection.create({
      data: {
        providerAccountId,
        state: 'ACTIVE',
        activatedAt: new Date(),
        workspace: { connect: { id: workspaceId } },
      },
    });
  }

  private presentAccount(
    accountId: string,
    status: ConnectedAccountStatus,
    fallbackName: string,
  ) {
    return {
      displayName: status.displayName || fallbackName,
      maskedId: this.maskAccountId(accountId),
      country: status.country ?? null,
      defaultCurrency: status.defaultCurrency ?? null,
      accountType: status.accountType ?? 'express',
      onboardingComplete: status.onboardingComplete,
      paymentsReady: status.paymentsReady,
      payoutsReady: status.payoutsReady ?? false,
    };
  }

  private maskAccountId(accountId: string) {
    const suffix = accountId.slice(-4);
    return `acct_••••${suffix}`;
  }

  private async markAccountUnavailable(
    workspaceId: string,
    providerAccountId: string,
  ) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.stripeConnection.updateMany({
        where: {
          workspaceId,
          providerAccountId,
          state: { in: ['ACTIVE', 'REPLACEMENT_PENDING'] },
        },
        data: { state: 'DISCONNECTED', deactivatedAt: now },
      }),
      this.prisma.workspace.updateMany({
        where: { id: workspaceId, stripeAccountId: providerAccountId },
        data: { stripeAccountId: null },
      }),
    ]);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
