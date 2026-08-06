import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptWebhookSecret, encryptWebhookSecret } from './webhook-secret';
import {
  OUTBOUND_WEBHOOK_TRANSPORT,
  type OutboundWebhookTransport,
} from './outbound-webhook.transport';
import { OutboundDestinationPolicy } from './outbound-destination.policy';

const destinationSelect = {
  url: true,
  createdAt: true,
  updatedAt: true,
} as const;

const pendingAttemptSelect = {
  id: true,
  attemptedAt: true,
  attemptNumber: true,
  destinationUrl: true,
  eventType: true,
  paymentPublicId: true,
  paymentStatus: true,
  payload: true,
  encryptedSigningSecret: true,
  workspaceId: true,
  destinationId: true,
  paymentEventId: true,
} as const;

@Injectable()
export class WebhookDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTBOUND_WEBHOOK_TRANSPORT)
    private readonly transport: OutboundWebhookTransport,
    private readonly destinationPolicy: OutboundDestinationPolicy,
  ) {}

  async configure(workspaceId: string, url: string) {
    await this.destinationPolicy.assertSafe(url);
    const signingSecret = `pms_whsec_${randomBytes(32).toString('hex')}`;
    const destination = await this.prisma.webhookDestination.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        url,
        encryptedSigningSecret: encryptWebhookSecret(signingSecret),
      },
      update: {
        url,
        encryptedSigningSecret: encryptWebhookSecret(signingSecret),
      },
      select: destinationSelect,
    });
    return { ...destination, signingSecret };
  }

  async inspect(workspaceId: string) {
    const destination = await this.prisma.webhookDestination.findUnique({
      where: { workspaceId },
      select: destinationSelect,
    });
    if (!destination)
      throw new NotFoundException('Webhook destination not found');
    return destination;
  }

  deliverPendingForEvent(providerEventId: string) {
    return this.deliverPending(providerEventId);
  }

  deliverPendingForPayment(paymentRequestId: number) {
    return this.deliverPending(undefined, paymentRequestId);
  }

  deliverAllPending() {
    return this.deliverPending();
  }

  private async deliverPending(
    providerEventId?: string,
    paymentRequestId?: number,
  ) {
    const staleBefore = new Date(Date.now() - 60_000);
    const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
      where: {
        outcome: 'PENDING',
        paymentEvent: {
          ...(providerEventId ? { providerEventId } : {}),
          ...(paymentRequestId ? { paymentRequestId } : {}),
        },
        OR: [{ attemptedAt: null }, { attemptedAt: { lt: staleBefore } }],
      },
      select: pendingAttemptSelect,
    });

    for (const pendingAttempt of attempts) {
      let attempt = pendingAttempt;
      if (attempt.attemptedAt) {
        const retry = await this.prisma.$transaction(async (transaction) => {
          const finalized = await transaction.webhookDeliveryAttempt.updateMany(
            {
              where: {
                id: attempt.id,
                outcome: 'PENDING',
                attemptedAt: { lt: staleBefore },
              },
              data: {
                outcome: 'FAILED',
                failureSummary:
                  'Delivery outcome unknown after interrupted attempt',
              },
            },
          );
          if (finalized.count !== 1) return null;
          return transaction.webhookDeliveryAttempt.create({
            data: {
              outcome: 'PENDING',
              attemptNumber: attempt.attemptNumber + 1,
              destinationUrl: attempt.destinationUrl,
              eventType: attempt.eventType,
              paymentPublicId: attempt.paymentPublicId,
              paymentStatus: attempt.paymentStatus,
              payload: attempt.payload,
              encryptedSigningSecret: attempt.encryptedSigningSecret,
              workspaceId: attempt.workspaceId,
              destinationId: attempt.destinationId,
              paymentEventId: attempt.paymentEventId,
            },
            select: pendingAttemptSelect,
          });
        });
        if (!retry) continue;
        attempt = retry;
      }

      const attemptedAt = new Date();
      const claimed = await this.prisma.webhookDeliveryAttempt.updateMany({
        where: {
          id: attempt.id,
          outcome: 'PENDING',
          OR: [{ attemptedAt: null }, { attemptedAt: { lt: staleBefore } }],
        },
        data: { attemptedAt },
      });
      if (claimed.count !== 1) continue;

      let outcome: 'DELIVERED' | 'FAILED' = 'FAILED';
      let responseStatus: number | null = null;
      let failureSummary: string | null = null;
      try {
        const timestamp = Math.floor(attemptedAt.getTime() / 1000).toString();
        const secret = decryptWebhookSecret(attempt.encryptedSigningSecret);
        const signature = createHmac('sha256', secret)
          .update(`${timestamp}.${attempt.payload}`)
          .digest('hex');
        const response = await this.transport.deliver({
          url: attempt.destinationUrl,
          body: attempt.payload,
          headers: {
            'Content-Type': 'application/json',
            'Payment-Signature': `t=${timestamp},v1=${signature}`,
          },
        });
        responseStatus = response.status;
        outcome =
          response.status >= 200 && response.status < 300
            ? 'DELIVERED'
            : 'FAILED';
        if (outcome === 'FAILED')
          failureSummary = `Destination returned HTTP ${response.status}`;
      } catch (error: unknown) {
        failureSummary =
          error instanceof Error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'Destination request timed out'
            : 'Destination network request failed';
      }
      await this.prisma.webhookDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { outcome, responseStatus, failureSummary },
      });
    }
  }

  async list(
    workspaceId: string,
    paymentPublicId?: string,
    outcome?: 'DELIVERED' | 'FAILED',
  ) {
    const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
      where: {
        workspaceId,
        outcome: outcome ?? { in: ['DELIVERED', 'FAILED'] },
        ...(paymentPublicId ? { paymentPublicId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        attemptNumber: true,
        attemptedAt: true,
        outcome: true,
        responseStatus: true,
        failureSummary: true,
        destinationUrl: true,
        paymentEvent: { select: { providerEventId: true } },
        eventType: true,
        paymentPublicId: true,
      },
    });
    return attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      attemptedAt: attempt.attemptedAt,
      outcome: attempt.outcome,
      responseStatus: attempt.responseStatus,
      failureSummary: attempt.failureSummary,
      destination: { url: attempt.destinationUrl },
      event: {
        id: attempt.paymentEvent.providerEventId,
        type: attempt.eventType,
        paymentPublicId: attempt.paymentPublicId,
      },
    }));
  }
}
