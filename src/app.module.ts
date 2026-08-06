import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    PaymentRequestsModule,
    AuthModule,
    StripeConnectModule,
    WebhooksModule,
    WebhookDeliveriesModule,
    AlertsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
