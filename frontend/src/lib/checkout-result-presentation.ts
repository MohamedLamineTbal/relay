import type { PaymentStatus } from './types';

type CheckoutResultTone = 'SUCCESS' | 'PENDING' | 'ERROR' | 'NEUTRAL';

type CheckoutResultPresentation = {
  title: string;
  detail: string;
  tone: CheckoutResultTone;
};

const presentationByStatus: Record<PaymentStatus, CheckoutResultPresentation> =
  {
    PAID: {
      title: 'Payment received',
      detail: 'Your payment has been confirmed.',
      tone: 'SUCCESS',
    },
    PENDING: {
      title: 'Payment processing',
      detail:
        'We are confirming your payment. This page updates automatically.',
      tone: 'PENDING',
    },
    FAILED: {
      title: 'Payment not completed',
      detail:
        'Your payment could not be confirmed. Use the original payment link to try again.',
      tone: 'ERROR',
    },
    EXPIRED: {
      title: 'Payment request expired',
      detail: 'Ask the business for a new payment link.',
      tone: 'ERROR',
    },
    REFUNDED: {
      title: 'Payment refunded',
      detail: 'The confirmed payment was returned by the business.',
      tone: 'NEUTRAL',
    },
  };

export function checkoutResultPresentation(status: PaymentStatus) {
  return presentationByStatus[status];
}
