import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecentPayments,
  summarizePayments,
} from '../src/lib/dashboard-metrics.ts';

test('keeps paid volume separate by currency and excludes pending requests from checkout success rate', () => {
  const summary = summarizePayments([
    { amount: 60_000, currency: 'usd', status: 'PAID' },
    { amount: 6_000, currency: 'mad', status: 'PAID' },
    { amount: 5_000, currency: 'usd', status: 'REFUNDED' },
    { amount: 1_000, currency: 'usd', status: 'FAILED' },
    { amount: 2_000, currency: 'mad', status: 'EXPIRED' },
    { amount: 3_000, currency: 'usd', status: 'PENDING' },
    { amount: 4_000, currency: 'mad', status: 'PENDING' },
  ]);

  assert.deepEqual(summary, {
    paidVolumeByCurrency: [
      { currency: 'mad', amount: 6_000 },
      { currency: 'usd', amount: 60_000 },
    ],
    paidRequestCount: 2,
    requestCount: 7,
    pendingRequestCount: 2,
    successfulCheckoutCount: 3,
    terminalRequestCount: 5,
    checkoutSuccessRate: 60,
  });
});

test('selects recent payment requests by creation time without changing API order', () => {
  const payments = [
    { publicId: 'pay_oldest', createdAt: '2026-08-10T09:00:00.000Z' },
    { publicId: 'pay_newest', createdAt: '2026-08-14T12:00:00.000Z' },
    { publicId: 'pay_middle', createdAt: '2026-08-12T15:00:00.000Z' },
  ];

  const recent = getRecentPayments(payments, 2);

  assert.deepEqual(
    recent.map(({ publicId }) => publicId),
    ['pay_newest', 'pay_middle'],
  );
  assert.deepEqual(
    payments.map(({ publicId }) => publicId),
    ['pay_oldest', 'pay_newest', 'pay_middle'],
  );
});
