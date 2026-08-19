'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  collectionActionLabel,
  collectionJournalPhrase,
  presentCollection,
} from '@/lib/collections';
import type { Alert, PaymentRequest } from '@/lib/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export function CollectionJournalEntry({
  payment,
  alerts = [],
  showCustomer = true,
  index = 0,
}: {
  payment: PaymentRequest;
  alerts?: readonly Alert[];
  showCustomer?: boolean;
  index?: number;
}) {
  const presentation = presentCollection(payment, alerts);
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsAttention = presentation.group === 'NEEDS_YOU';
  const resolved = presentation.group === 'RESOLVED';
  const actionLabel = collectionActionLabel(presentation.primaryAction);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyLink = async () => {
    if (!payment.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(payment.checkoutUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy the checkout link');
    }
  };

  return (
    <motion.article
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{
        layout: { duration: reduceMotion ? 0 : 0.24 },
        opacity: { duration: reduceMotion ? 0 : 0.18 },
        y: {
          duration: reduceMotion ? 0 : 0.22,
          delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.12),
        },
      }}
      className="group border-b border-black/[.075] last:border-b-0"
    >
      <div className="journal-entry-hover flex items-start gap-3 px-1 py-5 sm:gap-4 sm:px-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <span
            className={cn(
              'mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
              needsAttention
                ? 'border-[#dfb7b0] bg-[#fff5f2] text-[#ad493d]'
                : resolved
                  ? 'border-[#b9d6cb] bg-[#edf7f3] text-primary'
                  : 'border-[#d8cfb8] bg-[#faf7ee] text-[#8a7442]',
            )}
          >
            {needsAttention ? (
              <CircleAlert className="h-3.5 w-3.5" />
            ) : resolved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            {showCustomer && (
              <span className="block truncate text-sm font-semibold tracking-[-.01em]">
                {payment.customer.name}
              </span>
            )}
            <span
              className={cn(
                'block text-sm leading-6 text-[#56615d]',
                !showCustomer && 'text-foreground',
              )}
            >
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(payment.amount, payment.currency)}
              </span>{' '}
              for “{payment.description}”{' '}
              <span
                className={cn(
                  needsAttention && 'font-medium text-[#a74337]',
                  resolved && 'text-primary',
                )}
              >
                {collectionJournalPhrase(payment, presentation)}
              </span>
            </span>
            <span className="mt-1 block text-xs text-muted">
              {presentation.statusLabel} · Created{' '}
              {formatDate(payment.createdAt)}
            </span>
          </span>

          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="mt-1 hidden rounded-full p-1 text-muted group-hover:text-foreground sm:block"
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        {presentation.primaryAction === 'COPY_LINK' && payment.checkoutUrl ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className={cn(
              'mt-0.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
              copied
                ? 'bg-[#e2f0ea] text-primary'
                : 'text-muted hover:bg-black/[.045] hover:text-foreground',
            )}
            aria-live="polite"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? 'copied' : 'copy'}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7 }
                }
                transition={{ duration: reduceMotion ? 0 : 0.14 }}
                className="inline-flex items-center gap-1.5"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy link'}
              </motion.span>
            </AnimatePresence>
          </button>
        ) : presentation.primaryAction ? (
          <Link
            href={`/collections/${payment.publicId}`}
            className="mt-0.5 hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted outline-none hover:bg-black/[.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 sm:inline-flex"
          >
            {actionLabel} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="overflow-hidden"
          >
            <div className="mb-5 ml-10 border-l border-black/10 pl-4 sm:ml-14 sm:flex sm:items-end sm:justify-between sm:gap-6">
              <div>
                <p className="max-w-2xl text-xs leading-5 text-muted">
                  {presentation.statusDetail}
                </p>
                {presentation.latestEmailLabel && (
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {presentation.latestEmailLabel}
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 sm:mt-0 sm:shrink-0">
                <Link
                  href={`/people/${payment.customer.id}`}
                  className="text-xs font-semibold text-muted hover:text-primary"
                >
                  Customer history
                </Link>
                <Link
                  href={`/collections/${payment.publicId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  Full journey <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function CollectionHistoryChapter({
  payments,
  alerts = [],
  index = 0,
}: {
  payments: PaymentRequest[];
  alerts?: readonly Alert[];
  index?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const customer = payments[0]?.customer;

  if (!customer) return null;

  const paidByCurrency = new Map<string, number>();
  let nonPaidOutcomes = 0;
  payments.forEach((payment) => {
    if (payment.status === 'PAID') {
      const currency = payment.currency.toLowerCase();
      paidByCurrency.set(
        currency,
        (paidByCurrency.get(currency) ?? 0) + payment.amount,
      );
    } else {
      nonPaidOutcomes += 1;
    }
  });
  const paidSummary = [...paidByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' + ');

  return (
    <motion.section
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.22,
        delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.14),
      }}
      className="border-b border-black/[.075] last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="journal-entry-hover flex w-full items-center gap-3 px-1 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:px-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e4ece8] text-xs font-semibold text-primary">
          {customer.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {customer.name}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            {payments.length} completed{' '}
            {payments.length === 1 ? 'request' : 'requests'}
            {paidSummary ? ` · ${paidSummary} received` : ''}
            {nonPaidOutcomes
              ? ` · ${nonPaidOutcomes} other ${nonPaidOutcomes === 1 ? 'outcome' : 'outcomes'}`
              : ''}
          </span>
        </span>
        <span className="hidden text-xs font-medium text-muted sm:block">
          {expanded ? 'Close chapter' : 'Open chapter'}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          className="text-muted"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24 }}
            className="overflow-hidden"
          >
            <div className="mb-3 ml-4 border-l border-black/10 pl-4 sm:ml-11 sm:pl-5">
              {payments.map((payment, paymentIndex) => (
                <CollectionJournalEntry
                  key={payment.publicId}
                  payment={payment}
                  alerts={alerts}
                  showCustomer={false}
                  index={paymentIndex}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
