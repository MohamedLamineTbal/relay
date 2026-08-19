import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionJournalPhrase,
  presentCollection,
} from '../src/lib/collections.ts';
import type { Alert, PaymentRequest } from '../src/lib/types.ts';

function payment(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    publicId: 'pay_123',
    description: 'Invoice 42',
    internalReference: null,
    amount: 89_000,
    currency: 'mad',
    status: 'PENDING',
    checkoutUrl: 'https://checkout.example/pay_123',
    providerCheckoutSessionId: 'cs_123',
    providerPaymentIntentId: null,
    sendEmailRequested: false,
    createdAt: '2026-08-15T10:00:00.000Z',
    customer: {
      id: 1,
      name: 'Samir El Idrissi',
      email: 'samir@example.com',
    },
    ...overrides,
  };
}

test('describes a copied checkout link without claiming it was delivered', () => {
  assert.deepEqual(presentCollection(payment()), {
    group: 'WAITING',
    statusLabel: 'Link ready',
    statusDetail: 'Delivery is unverified until the customer opens the link.',
    primaryAction: 'COPY_LINK',
    latestEmailLabel: null,
  });
});

test('uses provider-acceptance language for sent payment email', () => {
  const collection = presentCollection(
    payment({
      sendEmailRequested: true,
      latestEmailDelivery: {
        id: 'email_1',
        status: 'SENT',
        recipientEmail: 'samir@example.com',
        providerMessageId: 'provider_1',
        failureSummary: null,
        createdAt: '2026-08-15T10:00:00.000Z',
        attemptedAt: '2026-08-15T10:00:01.000Z',
        sentAt: '2026-08-15T10:00:01.000Z',
      },
    }),
  );

  assert.equal(collection.group, 'WAITING');
  assert.equal(collection.statusLabel, 'Waiting for payment');
  assert.equal(collection.latestEmailLabel, 'Email accepted');
  assert.match(collection.statusDetail, /provider accepted/);
});

test('elevates failed delivery into a useful next action', () => {
  const collection = presentCollection(
    payment({
      sendEmailRequested: true,
      latestEmailDelivery: {
        id: 'email_1',
        status: 'FAILED',
        recipientEmail: 'samir@example.com',
        providerMessageId: null,
        failureSummary: 'Mailbox rejected the request',
        createdAt: '2026-08-15T10:00:00.000Z',
        attemptedAt: '2026-08-15T10:00:01.000Z',
        sentAt: null,
      },
    }),
  );

  assert.equal(collection.group, 'NEEDS_YOU');
  assert.equal(collection.statusLabel, 'Email send failed');
  assert.equal(collection.primaryAction, 'REVIEW_AND_RESEND');
});

test('keeps internal outbound delivery failures out of the Collection flow', () => {
  const internalAlert: Alert = {
    id: 'alert_1',
    type: 'WEBHOOK_DELIVERY_FAILED',
    status: 'ACTIVE',
    createdAt: '2026-08-15T10:00:00.000Z',
    acknowledgedAt: null,
    acknowledgedBy: null,
    payment: { publicId: 'pay_123' },
  };

  const collection = presentCollection(payment(), [internalAlert]);

  assert.equal(collection.group, 'WAITING');
  assert.equal(collection.statusLabel, 'Link ready');
});

test('treats paid and refunded collections as resolved', () => {
  assert.equal(
    presentCollection(payment({ status: 'PAID' })).group,
    'RESOLVED',
  );
  assert.equal(
    presentCollection(payment({ status: 'REFUNDED' })).group,
    'RESOLVED',
  );
});

test('writes journal states as business-readable sentences', () => {
  const pending = payment();
  const waiting = presentCollection(pending);
  assert.equal(collectionJournalPhrase(pending, waiting), 'is ready to share.');

  const paid = payment({ status: 'PAID' });
  assert.equal(
    collectionJournalPhrase(paid, presentCollection(paid)),
    'was paid.',
  );
});
