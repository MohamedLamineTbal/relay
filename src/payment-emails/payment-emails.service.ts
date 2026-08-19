import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  PaymentEmailProviderError,
} from './email-provider';
import { renderPaymentEmail } from './payment-email.template';
import {
  PAYMENT_EMAIL_SCHEDULER,
  type PaymentEmailScheduler,
} from './payment-email.scheduler';

const deliverySelect = {
  id: true,
  status: true,
  recipientEmail: true,
  providerMessageId: true,
  createdAt: true,
  attemptedAt: true,
  sentAt: true,
  failureSummary: true,
} as const;

type QueuePaymentEmailRequest = {
  paymentPublicId: string;
  workspaceId: string;
  requestedByUserId: number;
  requestedByEmail: string;
  idempotencyKey: string;
  ownerMessage: string | null;
  recipient: 'ORIGINAL' | 'CURRENT';
};

@Injectable()
export class PaymentEmailsService {
  private deliveryInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(PAYMENT_EMAIL_SCHEDULER)
    private readonly scheduler: PaymentEmailScheduler,
  ) {}

  async queue(request: QueuePaymentEmailRequest) {
    this.assertConfigured();

    const payment = await this.prisma.paymentRequest.findFirst({
      where: {
        publicId: request.paymentPublicId,
        workspaceId: request.workspaceId,
      },
      select: { id: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment request not found');
    }

    const internalIdempotencyKey = this.makeProviderIdempotencyKey(
      request.workspaceId,
      request.paymentPublicId,
      request.idempotencyKey,
    );
    try {
      const queued = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: number }>>`
          SELECT "id"
          FROM "PaymentRequest"
          WHERE "id" = ${payment.id}
          FOR UPDATE
        `;

        const lockedPayment = await transaction.paymentRequest.findFirst({
          where: { id: payment.id, workspaceId: request.workspaceId },
          select: {
            id: true,
            status: true,
            checkoutUrl: true,
            customer: { select: { email: true } },
          },
        });
        if (!lockedPayment) {
          throw new NotFoundException('Payment request not found');
        }
        if (lockedPayment.status !== 'PENDING') {
          throw new ConflictException(
            'Only pending payment requests can be sent',
          );
        }
        if (!lockedPayment.checkoutUrl) {
          throw new ConflictException('Payment request has no checkout link');
        }

        const existing = await transaction.paymentEmailDelivery.findUnique({
          where: { idempotencyKey: internalIdempotencyKey },
          select: deliverySelect,
        });
        if (existing) return { delivery: existing, created: false };

        const previousDeliveries =
          await transaction.paymentEmailDelivery.findMany({
            where: { paymentRequestId: lockedPayment.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { recipientEmail: true, createdAt: true },
          });
        const originalRecipient = previousDeliveries[0]?.recipientEmail;
        const recipientEmail =
          request.recipient === 'CURRENT' || !originalRecipient
            ? this.assertCanSendTo(lockedPayment.customer.email)
            : originalRecipient;
        const latestDelivery = previousDeliveries.at(-1);
        const now = this.scheduler.now();
        if (
          latestDelivery &&
          now.getTime() - latestDelivery.createdAt.getTime() < 60_000
        ) {
          throw new ConflictException(
            'Payment email can only be resent once every 60 seconds',
          );
        }

        const delivery = await transaction.paymentEmailDelivery.create({
          data: {
            recipientEmail,
            ownerMessage: request.ownerMessage,
            idempotencyKey: internalIdempotencyKey,
            requestedByUserId: request.requestedByUserId,
            requestedByEmail: request.requestedByEmail,
            paymentRequestId: lockedPayment.id,
            workspaceId: request.workspaceId,
            createdAt: now,
            nextAttemptAt: now,
          },
          select: deliverySelect,
        });
        return { delivery, created: true };
      });

      if (queued.created) this.schedulePendingDelivery();
      return queued.delivery;
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        const winningDelivery =
          await this.prisma.paymentEmailDelivery.findUnique({
            where: { idempotencyKey: internalIdempotencyKey },
            select: deliverySelect,
          });
        if (winningDelivery) return winningDelivery;
      }
      throw error;
    }
  }

  assertCanSendTo(email: string | null | undefined) {
    this.assertConfigured();
    const recipientEmail = email?.trim().toLowerCase();
    if (!recipientEmail || !this.isValidEmail(recipientEmail)) {
      throw new BadRequestException(
        'Customer needs a valid email address before this payment can be sent',
      );
    }
    return recipientEmail;
  }

  makeProviderIdempotencyKey(
    workspaceId: string,
    paymentPublicId: string,
    operationKey: string,
  ) {
    return `payment-email:${createHash('sha256')
      .update(`${workspaceId}\0${paymentPublicId}\0${operationKey}`)
      .digest('hex')}`;
  }

  schedulePendingDelivery() {
    this.scheduler.defer(() => this.deliverAllPending().catch(() => undefined));
  }

  scheduledAt() {
    return this.scheduler.now();
  }

  async list(paymentPublicId: string, workspaceId: string) {
    const payment = await this.prisma.paymentRequest.findFirst({
      where: { publicId: paymentPublicId, workspaceId },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException('Payment request not found');

    const deliveries = await this.prisma.paymentEmailDelivery.findMany({
      where: { paymentRequestId: payment.id, workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        recipientEmail: true,
        ownerMessage: true,
        providerMessageId: true,
        failureSummary: true,
        createdAt: true,
        attemptedAt: true,
        sentAt: true,
        requestedByUserId: true,
        requestedByEmail: true,
        attempts: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            id: true,
            attemptNumber: true,
            attemptedAt: true,
            outcome: true,
            providerMessageId: true,
            failureCode: true,
            failureSummary: true,
          },
        },
      },
    });

    return deliveries.map(
      ({ requestedByUserId, requestedByEmail, ...delivery }) => ({
        ...delivery,
        requestedBy: {
          id: requestedByUserId,
          email: requestedByEmail,
        },
      }),
    );
  }

  async deliverAllPending() {
    if (this.deliveryInProgress) return;
    this.deliveryInProgress = true;

    try {
      const now = this.scheduler.now();
      const staleBefore = new Date(now.getTime() - 60_000);
      const pending = await this.prisma.paymentEmailDelivery.findMany({
        where: {
          status: 'PENDING',
          nextAttemptAt: { lte: now },
          OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      for (const delivery of pending) {
        const claimed = await this.prisma.paymentEmailDelivery.updateMany({
          where: {
            id: delivery.id,
            status: 'PENDING',
            nextAttemptAt: { lte: now },
            OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
          },
          data: { claimedAt: now },
        });
        if (claimed.count === 1) await this.deliver(delivery.id, now);
      }
    } finally {
      this.deliveryInProgress = false;
    }
  }

  private async deliver(deliveryId: string, attemptedAt: Date) {
    const delivery = await this.prisma.paymentEmailDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        status: true,
        recipientEmail: true,
        requestedByEmail: true,
        ownerMessage: true,
        idempotencyKey: true,
        attemptCount: true,
        workspace: { select: { name: true } },
        paymentRequest: {
          select: {
            description: true,
            amount: true,
            currency: true,
            checkoutUrl: true,
            customer: { select: { name: true } },
          },
        },
      },
    });

    if (
      !delivery ||
      delivery.status !== 'PENDING' ||
      !delivery.paymentRequest.checkoutUrl
    ) {
      return;
    }

    const fromAddress = this.config.get<string>('EMAIL_FROM')!.trim();
    const content = renderPaymentEmail({
      workspaceName: delivery.workspace.name,
      customerName: delivery.paymentRequest.customer.name,
      description: delivery.paymentRequest.description,
      amount: delivery.paymentRequest.amount,
      currency: delivery.paymentRequest.currency,
      checkoutUrl: delivery.paymentRequest.checkoutUrl,
      ownerMessage: delivery.ownerMessage,
    });

    try {
      const sent = await this.emailProvider.sendPaymentEmail({
        from: `${delivery.workspace.name} via ${fromAddress}`,
        replyTo: delivery.requestedByEmail,
        to: delivery.recipientEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
        idempotencyKey: delivery.idempotencyKey,
      });

      const attemptNumber = delivery.attemptCount + 1;
      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentEmailAttempt.create({
          data: {
            deliveryId: delivery.id,
            attemptNumber,
            attemptedAt,
            outcome: 'SENT',
            providerMessageId: sent.messageId,
          },
        });
        await transaction.paymentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            providerMessageId: sent.messageId,
            attemptCount: attemptNumber,
            claimedAt: null,
            attemptedAt,
            sentAt: attemptedAt,
            failureSummary: null,
          },
        });
      });
    } catch (error: unknown) {
      const attemptNumber = delivery.attemptCount + 1;
      const permanent =
        error instanceof PaymentEmailProviderError &&
        error.kind === 'PERMANENT';
      const exhausted = attemptNumber >= 3;
      const failureCode =
        error instanceof PaymentEmailProviderError
          ? error.safeCode
          : 'PROVIDER_UNAVAILABLE';
      const failureSummary = permanent
        ? 'Email provider rejected the recipient or message'
        : exhausted
          ? 'Email could not be sent after automatic retries'
          : 'Email provider is temporarily unavailable';
      const retryDelayMs = attemptNumber === 1 ? 60_000 : 5 * 60_000;

      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentEmailAttempt.create({
          data: {
            deliveryId: delivery.id,
            attemptNumber,
            attemptedAt,
            outcome: permanent ? 'PERMANENT_FAILURE' : 'TRANSIENT_FAILURE',
            failureCode,
            failureSummary,
          },
        });
        await transaction.paymentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: permanent || exhausted ? 'FAILED' : 'PENDING',
            attemptCount: attemptNumber,
            claimedAt: null,
            attemptedAt,
            nextAttemptAt: new Date(attemptedAt.getTime() + retryDelayMs),
            failureSummary,
          },
        });
      });
    }
  }

  private assertConfigured() {
    if (
      !this.config.get<string>('RESEND_API_KEY')?.trim() ||
      !this.config.get<string>('EMAIL_FROM')?.trim()
    ) {
      throw new ServiceUnavailableException('Payment email is not configured');
    }
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
