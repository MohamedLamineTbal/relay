export const PAYMENT_EMAIL_SCHEDULER = Symbol('PAYMENT_EMAIL_SCHEDULER');

export type PaymentEmailTask = () => void | Promise<void>;

export interface PaymentEmailScheduler {
  now(): Date;
  defer(task: PaymentEmailTask): void;
  every(task: PaymentEmailTask, intervalMs: number): () => void;
}

export class SystemPaymentEmailScheduler implements PaymentEmailScheduler {
  now() {
    return new Date();
  }

  defer(task: PaymentEmailTask) {
    setImmediate(() => void task());
  }

  every(task: PaymentEmailTask, intervalMs: number) {
    const timer = setInterval(() => void task(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
