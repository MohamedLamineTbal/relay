export const STRIPE_WEBHOOK_PROVIDER = Symbol('STRIPE_WEBHOOK_PROVIDER');

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Invalid Stripe webhook signature');
    this.name = 'InvalidWebhookSignatureError';
  }
}

export type PaymentLifecycleEventType =
  | 'CHECKOUT_COMPLETED'
  | 'CHECKOUT_EXPIRED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'UNSUPPORTED';

export type VerifiedPaymentEvent = {
  id: string;
  connectedAccountId: string;
  providerType: string;
  type: PaymentLifecycleEventType;
  occurredAt: Date;
  providerCheckoutSessionId: string | null;
  providerPaymentIntentId: string | null;
  paymentRequestPublicId?: string | null;
};

export interface StripeWebhookProvider {
  verifyAndNormalize(
    payload: Buffer,
    signature: string,
  ): VerifiedPaymentEvent | Promise<VerifiedPaymentEvent>;
}
