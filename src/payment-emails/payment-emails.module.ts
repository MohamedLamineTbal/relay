import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EMAIL_PROVIDER } from './email-provider';
import { PaymentEmailWorker } from './payment-email.worker';
import { PaymentEmailsController } from './payment-emails.controller';
import { PaymentEmailsService } from './payment-emails.service';
import { ResendEmailProvider } from './resend-email.provider';
import {
  PAYMENT_EMAIL_SCHEDULER,
  SystemPaymentEmailScheduler,
} from './payment-email.scheduler';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PaymentEmailsController],
  providers: [
    PaymentEmailsService,
    PaymentEmailWorker,
    { provide: EMAIL_PROVIDER, useClass: ResendEmailProvider },
    {
      provide: PAYMENT_EMAIL_SCHEDULER,
      useClass: SystemPaymentEmailScheduler,
    },
  ],
  exports: [PaymentEmailsService],
})
export class PaymentEmailsModule {}
