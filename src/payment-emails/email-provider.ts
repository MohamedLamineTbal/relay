export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type SendPaymentEmailInput = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SentPaymentEmail = {
  messageId: string;
};

export interface EmailProvider {
  sendPaymentEmail(input: SendPaymentEmailInput): Promise<SentPaymentEmail>;
}

export type PaymentEmailFailureKind = 'TRANSIENT' | 'PERMANENT';

export class PaymentEmailProviderError extends Error {
  constructor(
    readonly kind: PaymentEmailFailureKind,
    readonly safeCode: string,
  ) {
    super(safeCode);
    this.name = 'PaymentEmailProviderError';
  }
}
