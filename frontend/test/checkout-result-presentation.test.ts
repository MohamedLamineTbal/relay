import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutResultPresentation } from '../src/lib/checkout-result-presentation.ts';

test('describes every checkout result in payer language without provider details', () => {
  const presentations = {
    PAID: checkoutResultPresentation('PAID'),
    PENDING: checkoutResultPresentation('PENDING'),
    FAILED: checkoutResultPresentation('FAILED'),
    EXPIRED: checkoutResultPresentation('EXPIRED'),
    REFUNDED: checkoutResultPresentation('REFUNDED'),
  };

  assert.deepEqual(presentations, {
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
  });
  assert.doesNotMatch(
    JSON.stringify(presentations),
    /stripe|session|webhook|payment.?intent|api|identifier/i,
  );
});
