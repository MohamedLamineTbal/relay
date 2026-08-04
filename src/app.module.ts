import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module';
import { AuthModule } from './auth/auth.module';
import { StripeConnectModule } from './stripe-connect/stripe-connect.module';

@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    PaymentRequestsModule,
    AuthModule,
    StripeConnectModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
