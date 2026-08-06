import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import {
  WebhookDeliveriesController,
  WebhookDeliveryHistoryController,
} from './webhook-deliveries.controller';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { OUTBOUND_WEBHOOK_TRANSPORT } from './outbound-webhook.transport';
import { FetchOutboundWebhookTransport } from './fetch-outbound-webhook.transport';
import {
  DESTINATION_RESOLVER,
  NodeDestinationResolver,
} from './destination-resolver';
import { OutboundDestinationPolicy } from './outbound-destination.policy';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WebhookDeliveriesController, WebhookDeliveryHistoryController],
  providers: [
    WebhookDeliveriesService,
    WebhookDeliveryWorker,
    OutboundDestinationPolicy,
    { provide: DESTINATION_RESOLVER, useClass: NodeDestinationResolver },
    {
      provide: OUTBOUND_WEBHOOK_TRANSPORT,
      useClass: FetchOutboundWebhookTransport,
    },
  ],
  exports: [WebhookDeliveriesService],
})
export class WebhookDeliveriesModule {}
