import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { STRIPE_WEBHOOK_PROVIDER } from './stripe-webhook.provider';
import { StripeWebhookAdapter } from './stripe-webhook.adapter';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PrismaModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    {
      provide: STRIPE_WEBHOOK_PROVIDER,
      useClass: StripeWebhookAdapter,
    },
  ],
})
export class WebhooksModule {}
