'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { checkoutResultPresentation } from '@/lib/checkout-result-presentation';
import { formatMoney } from '@/lib/utils';

const toneStyles = {
  SUCCESS: {
    icon: CheckCircle2,
    iconClassName: 'text-[#147a4b]',
    panelClassName: 'border-[#b9e5cf] bg-[#f2fbf6]',
  },
  PENDING: {
    icon: Clock3,
    iconClassName: 'text-[#a46500]',
    panelClassName: 'border-[#f2d7a8] bg-[#fffbf2]',
  },
  ERROR: {
    icon: XCircle,
    iconClassName: 'text-[#b7332e]',
    panelClassName: 'border-[#f0c3bf] bg-[#fff5f4]',
  },
  NEUTRAL: {
    icon: RotateCcw,
    iconClassName: 'text-primary',
    panelClassName: 'border-[#c9d5ff] bg-[#f3f6ff]',
  },
} as const;

const subscribeToCheckoutReference = () => () => undefined;
const readCheckoutReference = () =>
  new URLSearchParams(window.location.search).get('session_id');
const readServerCheckoutReference = () => undefined;

export default function Success() {
  const sessionId = useSyncExternalStore(
    subscribeToCheckoutReference,
    readCheckoutReference,
    readServerCheckoutReference,
  );

  useEffect(() => {
    window.history.replaceState(null, '', '/payments/success');
  }, []);

  const result = useQuery({
    queryKey: ['checkout-result', sessionId],
    queryFn: () => api.checkoutResult(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' ? 2_000 : false,
  });

  if (sessionId === undefined || (sessionId && result.isLoading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-6">
        <LoadingState label="Confirming your payment" />
      </main>
    );
  }

  if (!sessionId || result.error || !result.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-6">
        <div className="w-full max-w-md">
          <ErrorState message="We could not verify this payment. Return to the original payment link or contact the business." />
        </div>
      </main>
    );
  }

  const payment = result.data;
  const presentation = checkoutResultPresentation(payment.status);
  const tone = toneStyles[presentation.tone];
  const Icon = tone.icon;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <CircleDollarSign className="h-5 w-5" />
          </span>
          Relay
        </div>

        <div
          className={`mt-8 rounded-xl border p-5 text-center ${tone.panelClassName}`}
          aria-live="polite"
        >
          <Icon className={`mx-auto h-11 w-11 ${tone.iconClassName}`} />
          <h1 className="mt-4 text-2xl font-semibold">{presentation.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {presentation.detail}
          </p>
        </div>

        <dl className="mt-6 divide-y rounded-xl border px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted">Business</dt>
            <dd className="text-right text-sm font-semibold">
              {payment.businessName}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted">Payment for</dt>
            <dd className="text-right text-sm font-medium">
              {payment.description}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted">Amount</dt>
            <dd className="text-right text-lg font-semibold tabular-nums">
              {formatMoney(payment.amount, payment.currency)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          This page shows only the payment information needed for your
          confirmation. You may close it when finished.
        </div>
      </div>
    </main>
  );
}
