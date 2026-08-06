export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type CreateCheckoutInput = {
  connectedAccountId: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail: string | null;
  idempotencyKey: string;
  paymentRequestPublicId: string;
};

export type CheckoutSession = {
  id: string;
  paymentIntentId: string | null;
  url: string;
};

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
}
