import type { PaymentStatus } from './types';

type DashboardPayment = {
  amount: number;
  currency: string;
  status: PaymentStatus;
};

const SUCCESSFUL_CHECKOUT_STATUSES = new Set<PaymentStatus>([
  'PAID',
  'REFUNDED',
]);
const TERMINAL_CHECKOUT_STATUSES = new Set<PaymentStatus>([
  'PAID',
  'REFUNDED',
  'FAILED',
  'EXPIRED',
]);

export function summarizePayments(payments: readonly DashboardPayment[]) {
  const paidVolume = new Map<string, number>();
  let paidRequestCount = 0;
  let pendingRequestCount = 0;
  let successfulCheckoutCount = 0;
  let terminalRequestCount = 0;

  for (const payment of payments) {
    if (payment.status === 'PAID') {
      const currency = payment.currency.toLowerCase();
      paidVolume.set(
        currency,
        (paidVolume.get(currency) ?? 0) + payment.amount,
      );
      paidRequestCount += 1;
    }
    if (payment.status === 'PENDING') pendingRequestCount += 1;
    if (SUCCESSFUL_CHECKOUT_STATUSES.has(payment.status)) {
      successfulCheckoutCount += 1;
    }
    if (TERMINAL_CHECKOUT_STATUSES.has(payment.status)) {
      terminalRequestCount += 1;
    }
  }

  return {
    paidVolumeByCurrency: [...paidVolume.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    paidRequestCount,
    requestCount: payments.length,
    pendingRequestCount,
    successfulCheckoutCount,
    terminalRequestCount,
    checkoutSuccessRate: terminalRequestCount
      ? Math.round((successfulCheckoutCount / terminalRequestCount) * 100)
      : null,
  };
}

export function getRecentPayments<T extends { createdAt: string }>(
  payments: readonly T[],
  limit = 6,
) {
  return [...payments]
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )
    .slice(0, limit);
}
