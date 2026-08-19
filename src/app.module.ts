import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { AuthModule } from './auth/auth.module';
import { StripeConnectModule } from './stripe-connect/stripe-connect.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WebhookDeliveriesModule } from './webhook-deliveries/webhook-deliveries.module';
import { AlertsModule } from './alerts/alerts.module';
import { PaymentEmailsModule } from './payment-emails/payment-emails.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CustomersModule,
    PaymentRequestsModule,
    AuthModule,
    StripeConnectModule,
    WebhooksModule,
    WebhookDeliveriesModule,
    AlertsModule,
    PaymentEmailsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
