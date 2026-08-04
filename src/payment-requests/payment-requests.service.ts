import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentRequestsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(
    description: string,
    amount: number,
    customerId: number,
    workspaceId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, workspaceId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.paymentRequest.create({
      data: {
        description,
        amount,
        customer: { connect: { id: customer.id } },
      },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findMany(workspaceId: string) {
    return this.prisma.paymentRequest.findMany({
      where: { customer: { workspaceId } },
      orderBy: { id: 'asc' },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(publicId: string, workspaceId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findFirst({
      where: {
        publicId,
        customer: { workspaceId },
      },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    return paymentRequest;
  }

  async findByPublicId(publicId: string) {
    const paymentRequest = await this.prisma.paymentRequest.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
      },
    });

    if (!paymentRequest) {
      throw new NotFoundException('Payment request not found');
    }

    return paymentRequest;
  }
}
