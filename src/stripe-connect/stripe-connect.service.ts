import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  STRIPE_CONNECT_PROVIDER,
  type StripeConnectProvider,
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
      select: { stripeAccountId: true },
    });

    if (!workspace.stripeAccountId) {
      return {
        connected: false,
        onboardingComplete: false,
        paymentsReady: false,
      };
    }

    const status = await this.stripeProvider.getAccountStatus(
      workspace.stripeAccountId,
    );

    return {
      connected: true,
      onboardingComplete: status.onboardingComplete,
      paymentsReady: status.paymentsReady,
    };
  }

  async startOnboarding(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { stripeAccountId: true },
    });
    let accountId = workspace.stripeAccountId;

    if (!accountId) {
      const account = await this.stripeProvider.createAccount(workspaceId);
      accountId = account.id;
      try {
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: { stripeAccountId: accountId },
        });
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'Stripe account is already connected to another workspace',
          );
        }

        throw error;
      }
    }

    const onboardingLink =
      await this.stripeProvider.createOnboardingLink(accountId);

    return { url: onboardingLink.url };
  }
}
