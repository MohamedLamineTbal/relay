import { Injectable, NotFoundException } from '@nestjs/common';
import type { AlertStatus, AlertType } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

type AcknowledgingOwner = { id: number; email: string };
type AlertProjection = {
  id: string;
  type: AlertType;
  status: AlertStatus;
  createdAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByEmail: string | null;
  paymentPublicId: string | null;
  deliveryAttemptId: string | null;
  deliveryAttemptNumber: number | null;
};

const alertSelect = {
  id: true,
  type: true,
  status: true,
  createdAt: true,
  acknowledgedAt: true,
  acknowledgedByEmail: true,
  paymentPublicId: true,
  deliveryAttemptId: true,
  deliveryAttemptNumber: true,
} as const;

function presentAlert(alert: AlertProjection) {
  return {
    id: alert.id,
    type: alert.type,
    status: alert.status,
    createdAt: alert.createdAt,
    acknowledgedAt: alert.acknowledgedAt,
    acknowledgedBy: alert.acknowledgedByEmail
      ? { email: alert.acknowledgedByEmail }
      : null,
    ...(alert.paymentPublicId
      ? { payment: { publicId: alert.paymentPublicId } }
      : {}),
    ...(alert.deliveryAttemptId !== null && alert.deliveryAttemptNumber !== null
      ? {
          delivery: {
            id: alert.deliveryAttemptId,
            attemptNumber: alert.deliveryAttemptNumber,
          },
        }
      : {}),
  };
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    status: 'ACTIVE' | 'ACKNOWLEDGED' = 'ACTIVE',
  ) {
    const alerts = await this.prisma.alert.findMany({
      where: { workspaceId, status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: alertSelect,
    });
    return alerts.map(presentAlert);
  }

  async acknowledge(
    workspaceId: string,
    owner: AcknowledgingOwner,
    alertId: string,
  ) {
    const alert = await this.prisma.$transaction(async (transaction) => {
      await transaction.alert.updateMany({
        where: { id: alertId, workspaceId, status: 'ACTIVE' },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedByUserId: owner.id,
          acknowledgedByEmail: owner.email,
        },
      });
      return transaction.alert.findFirst({
        where: { id: alertId, workspaceId },
        select: alertSelect,
      });
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return presentAlert(alert);
  }
}
