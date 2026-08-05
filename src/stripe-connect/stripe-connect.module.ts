import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeConnectController } from './stripe-connect.controller';
import { StripeConnectService } from './stripe-connect.service';
import { STRIPE_CONNECT_PROVIDER } from './stripe-connect.provider';
import { StripeConnectStripeProvider } from './stripe-connect.stripe-provider';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StripeConnectController],
  providers: [
    StripeConnectService,
    {
      provide: STRIPE_CONNECT_PROVIDER,
      useClass: StripeConnectStripeProvider,
    },
  ],
  exports: [STRIPE_CONNECT_PROVIDER],
})
export class StripeConnectModule {}
