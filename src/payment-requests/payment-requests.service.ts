import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentRequestsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(
  description: string,
  amount: number,
  customerId: number,
) {
  return this.prisma.paymentRequest.create({
    data: {
      description,
      amount,
      customerId,
    },
  });
}
  async findByPublicId(publicId: string) {
    return this.prisma.paymentRequest.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        description: true,
        amount: true,
        status: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
    });
  }
}
