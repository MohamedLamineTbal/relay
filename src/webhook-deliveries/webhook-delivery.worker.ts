import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebhookDeliveriesService } from './webhook-deliveries.service';

const DELIVERY_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly deliveries: WebhookDeliveriesService) {}

  onModuleInit() {
    void this.deliveries.deliverAllPending().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.deliveries.deliverAllPending().catch(() => undefined);
    }, DELIVERY_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
