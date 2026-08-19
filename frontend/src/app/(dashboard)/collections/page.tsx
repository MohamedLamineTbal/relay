'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import {
  CollectionHistoryChapter,
  CollectionJournalEntry,
} from '@/components/collection-journal-entry';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { presentCollection, sortCollectionsByNewest } from '@/lib/collections';
import type { PaymentRequest } from '@/lib/types';
import { cn, formatMoney } from '@/lib/utils';

type JournalLens = 'IN_MOTION' | 'NEEDS_YOU' | 'HISTORY';

const lensOptions: Array<{
  value: JournalLens;
  label: string;
  view?: string;
}> = [
  { value: 'IN_MOTION', label: 'Open' },
  { value: 'NEEDS_YOU', label: 'Needs attention', view: 'needs-you' },
  { value: 'HISTORY', label: 'History', view: 'completed' },
];

function lensFromView(view: string | null): JournalLens {
  if (view === 'needs-you') return 'NEEDS_YOU';
  if (view === 'completed' || view === 'history') return 'HISTORY';
  return 'IN_MOTION';
}

function groupHistoryByCustomer(payments: PaymentRequest[]) {
  const groups = new Map<number, PaymentRequest[]>();
  payments.forEach((payment) => {
    const existing = groups.get(payment.customer.id) ?? [];
    existing.push(payment);
    groups.set(payment.customer.id, existing);
  });
  return [...groups.values()];
}

function JournalSkeleton() {
  return (
    <div aria-label="Loading payment requests" className="mt-5">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-start gap-4 border-b border-black/[.06] px-3 py-5 motion-reduce:animate-none"
        >
          <span className="h-6 w-6 rounded-full bg-black/[.06]" />
          <span className="flex-1">
            <span className="block h-3 w-28 rounded bg-black/[.07]" />
            <span className="mt-3 block h-3 w-[min(480px,75%)] rounded bg-black/[.055]" />
            <span className="mt-3 block h-2.5 w-44 rounded bg-black/[.045]" />
          </span>
        </div>
      ))}
    </div>
  );
}

function CollectionsJournal() {
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const lens = lensFromView(searchParams.get('view'));
  const payments = useQuery({ queryKey: ['payments'], queryFn: api.payments });
  const alerts = useQuery({
    queryKey: ['alerts', 'ACTIVE'],
    queryFn: () => api.alerts('ACTIVE'),
  });

  const ordered = useMemo(
    () => sortCollectionsByNewest(payments.data ?? []),
    [payments.data],
  );
  const presentations = useMemo(
    () =>
      ordered.map((payment) => ({
        payment,
        presentation: presentCollection(payment, alerts.data ?? []),
      })),
    [alerts.data, ordered],
  );
  const needsAttention = presentations
    .filter(({ presentation }) => presentation.group === 'NEEDS_YOU')
    .map(({ payment }) => payment);
  const waiting = presentations
    .filter(({ presentation }) => presentation.group === 'WAITING')
    .map(({ payment }) => payment);
  const history = presentations
    .filter(({ presentation }) => presentation.group === 'RESOLVED')
    .map(({ payment }) => payment);
  const inMotion = presentations
    .filter(({ presentation }) => presentation.group !== 'RESOLVED')
    .map(({ payment }) => payment);
  const historyByCustomer = groupHistoryByCustomer(history);

  const paidByCurrency = (() => {
    const totals = new Map<string, number>();
    history
      .filter((payment) => payment.status === 'PAID')
      .forEach((payment) => {
        const currency = payment.currency.toLowerCase();
        totals.set(currency, (totals.get(currency) ?? 0) + payment.amount);
      });
    return [...totals.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  })();
  const usdPaid =
    paidByCurrency.find(([currency]) => currency === 'usd')?.[1] ?? 0;
  const previousCurrencyTotals = paidByCurrency.filter(
    ([currency]) => currency !== 'usd',
  );

  const visible = lens === 'NEEDS_YOU' ? needsAttention : inMotion;
  const visibleLenses = lensOptions.filter(
    (option) =>
      option.value !== 'NEEDS_YOU' ||
      needsAttention.length > 0 ||
      lens === 'NEEDS_YOU',
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-.045em]">
            Payment requests
          </h1>
          <p className="mt-2 text-sm text-muted">
            {inMotion.length} open
            <span aria-hidden="true"> · </span>
            {history.length} completed
            {needsAttention.length > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-medium text-[#a74337]">
                  {needsAttention.length} need attention
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/#collect"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-[#105749] sm:self-auto"
        >
          <Plus className="h-4 w-4" /> New payment request
        </Link>
      </header>

      <nav
        className="flex items-center gap-6 border-y border-black/[.08] py-4"
        aria-label="Payment request views"
      >
        {visibleLenses.map((option) => {
          const active = option.value === lens;
          const count =
            option.value === 'IN_MOTION'
              ? inMotion.length
              : option.value === 'NEEDS_YOU'
                ? needsAttention.length
                : history.length;
          const href = option.view
            ? `/collections?view=${option.view}`
            : '/collections';

          return (
            <Link
              key={option.value}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative py-1 text-sm font-medium',
                active ? 'text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {option.label}{' '}
              <span className="ml-1 text-xs tabular-nums opacity-60">
                {count}
              </span>
              {active && (
                <motion.span
                  layoutId="collection-journal-lens"
                  className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-primary"
                  transition={{ duration: reduceMotion ? 0 : 0.22 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {payments.isLoading ? (
        <JournalSkeleton />
      ) : payments.error ? (
        <ErrorState message={(payments.error as Error).message} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={lens}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            {lens === 'HISTORY' ? (
              <>
                <section className="flex flex-col gap-4 border-b border-black/[.08] py-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted">
                      Total received
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-.04em] tabular-nums">
                      {formatMoney(usdPaid, 'usd')}
                    </p>
                    {previousCurrencyTotals.length > 0 && (
                      <details className="group mt-3 text-xs text-muted">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                          Previous currency activity
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-5">
                          {previousCurrencyTotals.map(([currency, amount]) => (
                            <span
                              key={currency}
                              className="font-medium tabular-nums text-foreground"
                            >
                              {formatMoney(amount, currency)}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <p className="max-w-sm text-xs leading-5 text-muted">
                    Customer chapters keep related outcomes together and make
                    longer histories easier to scan.
                  </p>
                </section>

                {!historyByCustomer.length ? (
                  <EmptyState
                    title="No completed payment requests yet"
                    detail="Paid, refunded, expired, and closed outcomes will form your customer history here."
                  />
                ) : (
                  <section aria-label="Completed customer chapters">
                    {historyByCustomer.map((customerPayments, index) => (
                      <CollectionHistoryChapter
                        key={customerPayments[0].customer.id}
                        payments={customerPayments}
                        alerts={alerts.data ?? []}
                        index={index}
                      />
                    ))}
                  </section>
                )}
              </>
            ) : !visible.length ? (
              <EmptyState
                title={
                  lens === 'NEEDS_YOU'
                    ? 'Nothing needs your attention'
                    : 'No open payment requests'
                }
                detail={
                  lens === 'NEEDS_YOU'
                    ? 'A payment request will appear here when there is a clear next action.'
                    : 'Create a payment request from Home to get started.'
                }
              />
            ) : (
              <section
                aria-label={
                  lens === 'NEEDS_YOU'
                    ? 'Needs attention'
                    : 'Payments in motion'
                }
              >
                {lens === 'IN_MOTION' && waiting.length > 0 && (
                  <p className="border-b border-black/[.06] px-1 py-4 text-xs leading-5 text-muted sm:px-3">
                    These payment requests are awaiting an outcome. Open one to
                    see its activity or take the next action.
                  </p>
                )}
                {visible.map((payment, index) => (
                  <CollectionJournalEntry
                    key={payment.publicId}
                    payment={payment}
                    alerts={alerts.data ?? []}
                    index={index}
                  />
                ))}
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<JournalSkeleton />}>
      <CollectionsJournal />
    </Suspense>
  );
}
