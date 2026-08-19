import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

const MAX_ALLOCATION_ATTEMPTS = 6;

type ReplayRequester = {
  id: number;
  email: string;
};

@Injectable()
export class WebhookReplaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: WebhookDeliveriesService,
  ) {}

  async replay(
    workspaceId: string,
    requester: ReplayRequester,
    attemptId: string,
  ) {
    const requestedAt = new Date();
    for (
      let allocationAttempt = 1;
      allocationAttempt <= MAX_ALLOCATION_ATTEMPTS;
      allocationAttempt += 1
    ) {
      try {
        const replay = await this.createReplay(
          workspaceId,
          requester,
          attemptId,
          requestedAt,
        );
        void this.deliveries
          .deliverPendingAttempt(replay.id)
          .catch(() => undefined);
        return {
          id: replay.id,
          attemptNumber: replay.attemptNumber,
          outcome: replay.outcome,
          replay: {
            fromAttemptId: replay.replayedFromAttemptId,
            requestedAt: replay.replayRequestedAt,
            requestedBy: { email: replay.replayRequestedByEmail },
          },
        };
      } catch (error: unknown) {
        if (
          allocationAttempt === MAX_ALLOCATION_ATTEMPTS ||
          !this.isAllocationConflict(error)
        ) {
          throw error;
        }
      }
    }
    throw new Error('Unable to allocate webhook replay attempt');
  }

  private createReplay(
    workspaceId: string,
    requester: ReplayRequester,
    attemptId: string,
    requestedAt: Date,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const original = await transaction.webhookDeliveryAttempt.findFirst({
          where: { id: attemptId, workspaceId },
          select: {
            id: true,
            outcome: true,
            paymentEventId: true,
            eventType: true,
            paymentPublicId: true,
            paymentStatus: true,
            payload: true,
          },
        });
        if (!original) {
          throw new NotFoundException('Webhook delivery not found');
        }
        if (original.outcome !== 'FAILED') {
          throw new ConflictException(
            'Only failed webhook deliveries can be replayed',
          );
        }
        const destination = await transaction.webhookDestination.findUnique({
          where: { workspaceId },
          select: {
            id: true,
            url: true,
            encryptedSigningSecret: true,
          },
        });
        if (!destination) {
          throw new ConflictException(
            'Configure a webhook destination before replaying',
          );
        }
        const latestAttempt =
          await transaction.webhookDeliveryAttempt.findFirst({
            where: { paymentEventId: original.paymentEventId },
            orderBy: { attemptNumber: 'desc' },
            select: { attemptNumber: true },
          });
        return transaction.webhookDeliveryAttempt.create({
          data: {
            outcome: 'PENDING',
            attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
            destinationUrl: destination.url,
            eventType: original.eventType,
            paymentPublicId: original.paymentPublicId,
            paymentStatus: original.paymentStatus,
            payload: original.payload,
            encryptedSigningSecret: destination.encryptedSigningSecret,
            workspaceId,
            destinationId: destination.id,
            paymentEventId: original.paymentEventId,
            replayedFromAttemptId: original.id,
            replayRequestedAt: requestedAt,
            replayRequestedByUserId: requester.id,
            replayRequestedByEmail: requester.email,
          },
          select: {
            id: true,
            attemptNumber: true,
            outcome: true,
            replayedFromAttemptId: true,
            replayRequestedAt: true,
            replayRequestedByEmail: true,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private isAllocationConflict(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }
}
