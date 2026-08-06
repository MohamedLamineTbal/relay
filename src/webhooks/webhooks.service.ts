import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PaymentRequestStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDeliveriesService } from '../webhook-deliveries/webhook-deliveries.service';
import {
  InvalidWebhookSignatureError,
  STRIPE_WEBHOOK_PROVIDER,
  type PaymentLifecycleEventType,
  type StripeWebhookProvider,
  type VerifiedPaymentEvent,
} from './stripe-webhook.provider';

type SupportedPaymentEventType = Exclude<
  PaymentLifecycleEventType,
  'UNSUPPORTED'
>;

type LifecycleTransition = {
  status: PaymentRequestStatus;
  allowedFrom: PaymentRequestStatus[];
};

const lifecycleTransitions: Record<
  SupportedPaymentEventType,
  LifecycleTransition
> = {
  CHECKOUT_COMPLETED: {
    status: 'PAID',
    allowedFrom: ['PENDING', 'FAILED', 'PAID'],
  },
  CHECKOUT_EXPIRED: {
    status: 'EXPIRED',
    allowedFrom: ['PENDING', 'FAILED', 'EXPIRED'],
  },
  PAYMENT_FAILED: {
    status: 'FAILED',
    allowedFrom: ['PENDING', 'FAILED'],
  },
  PAYMENT_REFUNDED: {
    status: 'REFUNDED',
    allowedFrom: ['PAID', 'REFUNDED'],
  },
};

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_WEBHOOK_PROVIDER)
    private readonly stripeWebhookProvider: StripeWebhookProvider,
    private readonly webhookDeliveries: WebhookDeliveriesService,
  ) {}

  async process(payload: Buffer, signature: string) {
    let event: VerifiedPaymentEvent;

    try {
      event = await this.stripeWebhookProvider.verifyAndNormalize(
        payload,
        signature,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new BadRequestException('Valid Stripe signature is required');
      }

      throw error;
    }

    const existingEvent = await this.findDuplicateResponse(event.id);

    if (existingEvent) {
      void this.webhookDeliveries
        .deliverPendingForEvent(event.id)
        .catch(() => undefined);
      return existingEvent;
    }

    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { stripeAccountId: event.connectedAccountId },
      select: { id: true },
    });

    if (!this.isSupportedEvent(event)) {
      return this.recordUnhandledEvent(event, workspace.id);
    }

    const payment = await this.prisma.paymentRequest.findFirst({
      where: {
        workspaceId: workspace.id,
        OR: [
          ...(event.providerCheckoutSessionId
            ? [
                {
                  providerCheckoutSessionId: event.providerCheckoutSessionId,
                },
              ]
            : []),
          ...(event.providerPaymentIntentId
            ? [{ providerPaymentIntentId: event.providerPaymentIntentId }]
            : []),
          ...(event.paymentRequestPublicId
            ? [{ publicId: event.paymentRequestPublicId }]
            : []),
        ],
      },
      select: { id: true },
    });

    if (!payment) {
      return this.recordUnhandledEvent(event, workspace.id);
    }

    try {
      await this.recordMatchedEvent(event, workspace.id, payment.id);
      void this.webhookDeliveries
        .deliverPendingForPayment(payment.id)
        .catch(() => undefined);
    } catch (error: unknown) {
      const duplicateResponse = await this.resolveUniqueEventRace(
        error,
        event.id,
      );

      if (duplicateResponse) {
        void this.webhookDeliveries
          .deliverPendingForEvent(event.id)
          .catch(() => undefined);
        return duplicateResponse;
      }

      throw error;
    }

    return {
      received: true,
      duplicate: false,
      handled: true,
    };
  }

  private async resolveUniqueEventRace(
    error: unknown,
    providerEventId: string,
  ) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'P2002'
    ) {
      return null;
    }

    return this.findDuplicateResponse(providerEventId);
  }

  private isSupportedEvent(
    event: VerifiedPaymentEvent,
  ): event is VerifiedPaymentEvent & { type: SupportedPaymentEventType } {
    return event.type !== 'UNSUPPORTED';
  }

  private async recordUnhandledEvent(
    event: VerifiedPaymentEvent,
    workspaceId: string,
  ) {
    try {
      await this.prisma.paymentEvent.create({
        data: {
          providerEventId: event.id,
          providerType: event.providerType,
          type: event.type,
          occurredAt: event.occurredAt,
          providerCheckoutSessionId: event.providerCheckoutSessionId,
          providerPaymentIntentId: event.providerPaymentIntentId,
          workspaceId,
        },
      });
    } catch (error: unknown) {
      const duplicateResponse = await this.resolveUniqueEventRace(
        error,
        event.id,
      );

      if (duplicateResponse) {
        return duplicateResponse;
      }

      throw error;
    }

    return {
      received: true,
      duplicate: false,
      handled: false,
    };
  }

  private async recordMatchedEvent(
    event: VerifiedPaymentEvent & { type: SupportedPaymentEventType },
    workspaceId: string,
    paymentRequestId: number,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            const deliveryContext =
              await transaction.paymentRequest.findUniqueOrThrow({
                where: { id: paymentRequestId },
                select: {
                  publicId: true,
                  workspace: {
                    select: {
                      webhookDestination: {
                        select: {
                          id: true,
                          url: true,
                          encryptedSigningSecret: true,
                        },
                      },
                    },
                  },
                },
              });
            const activeDestination =
              deliveryContext.workspace.webhookDestination;
            await transaction.paymentEvent.create({
              data: {
                providerEventId: event.id,
                providerType: event.providerType,
                type: event.type,
                occurredAt: event.occurredAt,
                providerCheckoutSessionId: event.providerCheckoutSessionId,
                providerPaymentIntentId: event.providerPaymentIntentId,
                workspaceId,
                paymentRequestId,
                outboundDestinationId: activeDestination?.id,
                outboundDestinationUrl: activeDestination?.url,
                outboundEncryptedSigningSecret:
                  activeDestination?.encryptedSigningSecret,
              },
            });
            const paymentEvents = await transaction.paymentEvent.findMany({
              where: { paymentRequestId },
              orderBy: [{ occurredAt: 'asc' }, { providerEventId: 'asc' }],
              select: {
                id: true,
                providerEventId: true,
                type: true,
                occurredAt: true,
                providerPaymentIntentId: true,
                outboundDestinationId: true,
                outboundDestinationUrl: true,
                outboundEncryptedSigningSecret: true,
              },
            });
            let status: PaymentRequestStatus = 'PENDING';
            let lifecycleUpdatedAt: Date | null = null;
            let providerPaymentIntentId: string | null = null;

            for (const paymentEvent of paymentEvents) {
              const transition =
                lifecycleTransitions[
                  paymentEvent.type as SupportedPaymentEventType
                ];

              const transitioned =
                transition.allowedFrom.includes(status) &&
                status !== transition.status;
              if (transitioned) {
                status = transition.status;
              }

              lifecycleUpdatedAt = paymentEvent.occurredAt;
              providerPaymentIntentId =
                paymentEvent.providerPaymentIntentId ?? providerPaymentIntentId;

              await transaction.paymentEvent.update({
                where: { id: paymentEvent.id },
                data: { resultingStatus: status },
              });

              if (
                transitioned &&
                paymentEvent.outboundDestinationId &&
                paymentEvent.outboundDestinationUrl &&
                paymentEvent.outboundEncryptedSigningSecret
              ) {
                const eventType = `payment.${status.toLowerCase()}`;
                const payload = JSON.stringify({
                  id: paymentEvent.providerEventId,
                  type: eventType,
                  occurredAt: paymentEvent.occurredAt.toISOString(),
                  data: {
                    payment: { publicId: deliveryContext.publicId, status },
                  },
                });
                await transaction.webhookDeliveryAttempt.upsert({
                  where: {
                    paymentEventId_attemptNumber: {
                      paymentEventId: paymentEvent.id,
                      attemptNumber: 1,
                    },
                  },
                  update: {},
                  create: {
                    outcome: 'PENDING',
                    attemptNumber: 1,
                    destinationUrl: paymentEvent.outboundDestinationUrl,
                    eventType,
                    paymentPublicId: deliveryContext.publicId,
                    paymentStatus: status,
                    payload,
                    encryptedSigningSecret:
                      paymentEvent.outboundEncryptedSigningSecret,
                    workspaceId,
                    destinationId: paymentEvent.outboundDestinationId,
                    paymentEventId: paymentEvent.id,
                  },
                });
              }
            }

            await transaction.paymentRequest.update({
              where: { id: paymentRequestId },
              data: {
                status,
                lifecycleUpdatedAt,
                ...(providerPaymentIntentId ? { providerPaymentIntentId } : {}),
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );

        return;
      } catch (error: unknown) {
        if (this.isTransactionConflict(error) && attempt < 3) {
          continue;
        }

        throw error;
      }
    }
  }

  private isTransactionConflict(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }

  private async findDuplicateResponse(providerEventId: string) {
    const event = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId },
      select: { paymentRequestId: true },
    });

    if (!event) {
      return null;
    }

    return {
      received: true,
      duplicate: true,
      handled: event.paymentRequestId !== null,
    };
  }
}
