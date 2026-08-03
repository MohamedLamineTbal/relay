import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';

@Module({
  imports: [PrismaModule],
  providers: [PaymentRequestsService],
  controllers: [PaymentRequestsController]
})
export class PaymentRequestsModule {}
