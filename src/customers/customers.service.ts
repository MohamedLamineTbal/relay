import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, email: string | undefined, workspaceId: string) {
    return this.prisma.customer.create({
      data: {
        name,
        email,
        workspace: { connect: { id: workspaceId } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async findMany(workspaceId: string) {
    return this.prisma.customer.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: number, workspaceId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async findDossier(id: number, workspaceId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        paymentRequests: {
          orderBy: { createdAt: 'desc' },
          select: {
            publicId: true,
            description: true,
            internalReference: true,
            amount: true,
            currency: true,
            status: true,
            checkoutUrl: true,
            providerCheckoutSessionId: true,
            providerPaymentIntentId: true,
            sendEmailRequested: true,
            createdAt: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            emailDeliveries: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                recipientEmail: true,
                providerMessageId: true,
                failureSummary: true,
                createdAt: true,
                attemptedAt: true,
                sentAt: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const { paymentRequests, ...customerDetails } = customer;
    return {
      customer: customerDetails,
      collections: paymentRequests.map((paymentRequest) => {
        const { emailDeliveries, ...paymentDetails } = paymentRequest;
        return paymentRequest.sendEmailRequested
          ? {
              ...paymentDetails,
              latestEmailDelivery: emailDeliveries[0] ?? null,
            }
          : paymentDetails;
      }),
    };
  }

  async updateEmail(id: number, email: string, workspaceId: string) {
    const updated = await this.prisma.customer.updateMany({
      where: { id, workspaceId },
      data: { email },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Customer not found');
    }

    return this.findOne(id, workspaceId);
  }
}
