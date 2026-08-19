import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { AuthModule } from '../auth/auth.module';
import { StripeConnectModule } from '../stripe-connect/stripe-connect.module';
import { PAYMENT_PROVIDER } from './payment-provider';
import { StripePaymentProvider } from './stripe-payment.provider';
import { PaymentEmailsModule } from '../payment-emails/payment-emails.module';

@Module({
  imports: [PrismaModule, AuthModule, StripeConnectModule, PaymentEmailsModule],
  providers: [
    PaymentRequestsService,
    {
      provide: PAYMENT_PROVIDER,
      useClass: StripePaymentProvider,
    },
  ],
  controllers: [PaymentRequestsController],
})
export class PaymentRequestsModule {}
