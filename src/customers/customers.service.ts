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
}
