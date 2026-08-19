'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { CollectionComposer } from '@/components/collection-composer';
import { CollectionRow } from '@/components/collection-row';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { presentCollection, sortCollectionsByNewest } from '@/lib/collections';

export default function HomePage() {
  const payments = useQuery({ queryKey: ['payments'], queryFn: api.payments });
  const alerts = useQuery({
    queryKey: ['alerts', 'ACTIVE'],
    queryFn: () => api.alerts('ACTIVE'),
  });
  const stripe = useQuery({
    queryKey: ['stripe-status'],
    queryFn: api.stripeStatus,
  });

  if (payments.isLoading) {
    return <LoadingState label="Opening Home" />;
  }
  if (payments.error || !payments.data) {
    return (
      <ErrorState
        message={(payments.error as Error)?.message ?? 'Unable to open Home'}
      />
    );
  }

  const allAlerts = alerts.data ?? [];
  const ordered = sortCollectionsByNewest(payments.data);
  const needsYou = ordered.filter(
    (payment) => presentCollection(payment, allAlerts).group === 'NEEDS_YOU',
  );
  return (
    <>
      <div className="mx-auto mb-10 max-w-4xl text-center">
        <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-.05em] md:text-[42px]">
          Create and track payment requests.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted">
          Request a payment, then follow anything that needs your attention.
        </p>
      </div>

      {stripe.data && !stripe.data.paymentsReady && (
        <Link
          href="/stripe"
          className="mb-6 flex items-center justify-between gap-4 border-l-2 border-[#c48228] bg-[#fff8ea] px-4 py-3 text-sm"
        >
          <span>
            <strong className="text-[#6e4b18]">
              Stripe setup is blocking payment requests.
            </strong>{' '}
            <span className="text-[#806c4e]">
              Finish onboarding to create checkout links.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#8b5a17]" />
        </Link>
      )}

      <CollectionComposer />

      {needsYou.length ? (
        <section id="needs-you" className="mt-12 max-w-5xl">
          <div className="mb-2 flex items-end justify-between border-b border-black/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CircleAlert className="h-4 w-4 text-[#b54b3c]" />
                <h2 className="text-lg font-semibold tracking-[-.025em]">
                  Action queue
                </h2>
              </div>
              <p className="mt-1 text-xs text-muted">
                Only payment requests with a clear next action.
              </p>
            </div>
            <span className="text-2xl font-semibold tracking-[-.04em] tabular-nums">
              {needsYou.length}
            </span>
          </div>
          {needsYou.slice(0, 5).map((payment) => (
            <CollectionRow
              key={payment.publicId}
              payment={payment}
              alerts={allAlerts}
              condensed
            />
          ))}
        </section>
      ) : (
        <div id="needs-you" className="sr-only">
          Nothing needs your attention.
        </div>
      )}
    </>
  );
}
