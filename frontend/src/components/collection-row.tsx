'use client';

import { ArrowUpRight, Copy } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { collectionActionLabel, presentCollection } from '@/lib/collections';
import type { Alert, PaymentRequest } from '@/lib/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export function CollectionRow({
  payment,
  alerts = [],
  condensed = false,
}: {
  payment: PaymentRequest;
  alerts?: readonly Alert[];
  condensed?: boolean;
}) {
  const presentation = presentCollection(payment, alerts);
  const actionLabel = collectionActionLabel(presentation.primaryAction);
  const needsAttention = presentation.group === 'NEEDS_YOU';

  const copyLink = async () => {
    if (!payment.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(payment.checkoutUrl);
      toast.success('Checkout link copied', {
        description: 'Delivery is unverified until the customer uses it.',
      });
    } catch {
      toast.error('Could not copy the link');
    }
  };

  return (
    <article
      className={cn(
        'group grid gap-4 border-b border-black/[.075] px-1 py-5 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,.9fr)_auto] md:items-center',
        condensed && 'py-4',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/collections/${payment.publicId}`}
            className="truncate text-sm font-semibold tracking-[-.01em] hover:text-primary"
          >
            {payment.description}
          </Link>
          {needsAttention && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#c85646]" />
          )}
        </div>
        <Link
          href={`/people/${payment.customer.id}`}
          className="mt-1 block truncate text-xs text-muted hover:text-primary"
        >
          {payment.customer.name}
        </Link>
      </div>

      <p className="text-lg font-semibold tracking-[-.03em] tabular-nums md:text-base">
        {formatMoney(payment.amount, payment.currency)}
      </p>

      <div>
        <p
          className={cn(
            'text-xs font-semibold',
            needsAttention
              ? 'text-[#a74337]'
              : presentation.group === 'RESOLVED'
                ? 'text-primary'
                : 'text-[#786a4a]',
          )}
        >
          {presentation.statusLabel}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          {formatDate(payment.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-1 md:justify-end">
        {presentation.primaryAction === 'COPY_LINK' && payment.checkoutUrl ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted hover:bg-black/5 hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" /> {actionLabel}
          </button>
        ) : (
          <Link
            href={`/collections/${payment.publicId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted hover:bg-black/5 hover:text-foreground"
          >
            {actionLabel ?? 'Open'} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </article>
  );
}
