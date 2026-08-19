import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  PAYMENT_EMAIL_SCHEDULER,
  type PaymentEmailScheduler,
} from './payment-email.scheduler';
import { PaymentEmailsService } from './payment-emails.service';

const DELIVERY_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class PaymentEmailWorker implements OnModuleInit, OnModuleDestroy {
  private cancelSweep?: () => void;

  constructor(
    private readonly paymentEmails: PaymentEmailsService,
    @Inject(PAYMENT_EMAIL_SCHEDULER)
    private readonly scheduler: PaymentEmailScheduler,
  ) {}

  onModuleInit() {
    this.scheduler.defer(() =>
      this.paymentEmails.deliverAllPending().catch(() => undefined),
    );
    this.cancelSweep = this.scheduler.every(
      () => this.paymentEmails.deliverAllPending().catch(() => undefined),
      DELIVERY_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    this.cancelSweep?.();
  }
}
