import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
  async create(name: string, email: string | undefined, userId: number) {
  return this.prisma.customer.create({
    data: {
      name,
      email,
      userId,
    },
  });
}
}
