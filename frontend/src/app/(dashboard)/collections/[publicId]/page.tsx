'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Mail,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { presentCollection } from '@/lib/collections';
import type { PaymentStatus } from '@/lib/types';
import { cn, formatDate, formatMoney } from '@/lib/utils';

type ActivityItem = {
  id: string;
  occurredAt: string;
  title: string;
  detail?: string;
  tone?: 'default' | 'success' | 'danger';
};

function eventTitle(type: string, status: PaymentStatus | null) {
  if (status === 'PAID' || type.includes('completed'))
    return 'Payment completed';
  if (status === 'REFUNDED' || type.includes('refunded'))
    return 'Payment refunded';
  if (status === 'FAILED' || type.includes('failed')) return 'Payment failed';
  if (status === 'EXPIRED' || type.includes('expired'))
    return 'Checkout expired';
  return type.replaceAll('_', ' ').replaceAll('.', ' · ');
}

export default function CollectionDetailPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [recipient, setRecipient] = useState<'ORIGINAL' | 'CURRENT'>(
    'ORIGINAL',
  );
  const [message, setMessage] = useState('');
  const payment = useQuery({
    queryKey: ['payment', publicId],
    queryFn: () => api.payment(publicId),
  });
  const timeline = useQuery({
    queryKey: ['timeline', publicId],
    queryFn: () => api.paymentTimeline(publicId),
  });
  const deliveries = useQuery({
    queryKey: ['payment-email-deliveries', publicId],
    queryFn: () => api.paymentEmailDeliveries(publicId),
  });
  const alerts = useQuery({
    queryKey: ['alerts', 'ACTIVE'],
    queryFn: () => api.alerts('ACTIVE'),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sendEmail = useMutation({
    mutationFn: () =>
      api.sendPaymentEmail(
        publicId,
        {
          recipient,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
        crypto.randomUUID(),
      ),
    onSuccess: (delivery) => {
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['payment', publicId] });
      void queryClient.invalidateQueries({
        queryKey: ['payment-email-deliveries', publicId],
      });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment email queued', {
        description: `Sending to ${delivery.recipientEmail}.`,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const emailHistory = useMemo(() => deliveries.data ?? [], [deliveries.data]);
  const originalRecipient = emailHistory[0]?.recipientEmail ?? null;
  const latestDelivery = emailHistory.at(-1) ?? null;
  const cooldownSeconds = useMemo(() => {
    if (!latestDelivery) return 0;
    return Math.max(
      0,
      Math.ceil(
        (new Date(latestDelivery.createdAt).getTime() + 60_000 - now) / 1000,
      ),
    );
  }, [latestDelivery, now]);

  if (payment.isLoading)
    return <LoadingState label="Opening payment request" />;
  if (payment.error || !payment.data) {
    return (
      <ErrorState
        message={
          (payment.error as Error)?.message ?? 'Payment request not found'
        }
      />
    );
  }

  const p = payment.data;
  const presentation = presentCollection(p, alerts.data ?? []);
  const currentEmail = p.customer.email;
  const recipientChanged =
    originalRecipient && currentEmail && originalRecipient !== currentEmail;
  const canSend =
    p.status === 'PENDING' &&
    Boolean(originalRecipient || currentEmail) &&
    cooldownSeconds === 0;

  const activity: ActivityItem[] = [
    {
      id: 'created',
      occurredAt: p.createdAt,
      title: 'Payment request created',
      detail: p.sendEmailRequested
        ? 'Checkout created with email delivery requested.'
        : 'Checkout link created for manual sharing.',
    },
    ...emailHistory.map((delivery) => ({
      id: delivery.id,
      occurredAt: delivery.attemptedAt ?? delivery.createdAt,
      title:
        delivery.status === 'SENT'
          ? 'Email accepted by provider'
          : delivery.status === 'FAILED'
            ? 'Email send failed'
            : 'Email queued',
      detail:
        delivery.status === 'SENT'
          ? `The provider accepted the request for ${delivery.recipientEmail}. This does not confirm inbox delivery.`
          : (delivery.failureSummary ??
            `Queued for ${delivery.recipientEmail}.`),
      tone:
        delivery.status === 'SENT'
          ? ('success' as const)
          : delivery.status === 'FAILED'
            ? ('danger' as const)
            : ('default' as const),
    })),
    ...(timeline.data?.events ?? []).map((event, index) => ({
      id: `${event.providerReferences.eventId}-${index}`,
      occurredAt: event.occurredAt,
      title: eventTitle(event.type, event.resultingStatus),
      detail: 'Recorded from a verified payment-provider event.',
      tone:
        event.resultingStatus === 'PAID'
          ? ('success' as const)
          : event.resultingStatus === 'FAILED'
            ? ('danger' as const)
            : ('default' as const),
    })),
  ].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );

  const copyLink = async () => {
    if (!p.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(p.checkoutUrl);
      toast.success('Checkout link copied', {
        description: 'Delivery remains unverified until the customer uses it.',
      });
    } catch {
      toast.error('Could not copy the checkout link');
    }
  };

  const shareLabel = latestDelivery
    ? latestDelivery.status === 'SENT'
      ? 'Email accepted'
      : latestDelivery.status === 'FAILED'
        ? 'Email failed'
        : 'Email queued'
    : 'Link ready';

  return (
    <>
      <Link
        href="/collections"
        className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> All payment requests
      </Link>

      <header className="border-b border-black/10 pb-7">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <Link
              href={`/people/${p.customer.id}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <UserRound className="h-4 w-4" /> {p.customer.name}
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.055em] tabular-nums md:text-5xl">
              {formatMoney(p.amount, p.currency)}
            </h1>
            <p className="mt-2 text-base text-muted">{p.description}</p>
            {p.internalReference && (
              <p className="mt-1.5 text-xs text-muted">
                Internal reference: {p.internalReference}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.checkoutUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyLink()}
              >
                <Copy className="h-4 w-4" /> Copy link
              </Button>
            )}
            {p.checkoutUrl && (
              <a href={p.checkoutUrl} target="_blank" rel="noreferrer">
                <Button>
                  <ExternalLink className="h-4 w-4" /> Open checkout
                </Button>
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex min-w-0 items-center">
            {[
              { label: 'Created', state: 'complete' },
              {
                label: shareLabel,
                state:
                  latestDelivery?.status === 'FAILED' ? 'error' : 'complete',
              },
              {
                label:
                  p.status === 'PENDING'
                    ? 'Payment pending'
                    : presentation.statusLabel,
                state:
                  p.status === 'PENDING'
                    ? 'current'
                    : p.status === 'PAID' || p.status === 'REFUNDED'
                      ? 'complete'
                      : 'error',
              },
            ].map((milestone, index, milestones) => (
              <div
                key={`${milestone.label}-${index}`}
                className="flex min-w-0 flex-1 items-center last:flex-none"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                    milestone.state === 'complete' &&
                      'border-primary bg-primary text-white',
                    milestone.state === 'current' &&
                      'border-[#aa8a42] bg-[#fff7e7] text-[#8a671d] ring-4 ring-[#f2ead8]',
                    milestone.state === 'error' &&
                      'border-[#bf5548] bg-[#fff0ed] text-[#a74337]',
                  )}
                >
                  {milestone.state === 'complete' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : milestone.state === 'error' ? (
                    <CircleAlert className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </span>
                <span className="ml-2 hidden whitespace-nowrap text-[11px] font-semibold text-[#59645f] sm:inline">
                  {milestone.label}
                </span>
                {index < milestones.length - 1 && (
                  <span className="mx-3 h-px min-w-4 flex-1 bg-black/15" />
                )}
              </div>
            ))}
          </div>
          <div className="text-left md:text-right">
            <p
              className={cn(
                'text-sm font-semibold',
                presentation.group === 'NEEDS_YOU'
                  ? 'text-[#a74337]'
                  : presentation.group === 'RESOLVED'
                    ? 'text-primary'
                    : 'text-[#806a37]',
              )}
            >
              {presentation.statusLabel}
            </p>
            <p className="mt-1 text-xs text-muted">
              Created {formatDate(p.createdAt)}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-10 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-primary">
              Activity
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">
              What happened
            </h2>
          </div>

          {timeline.isLoading || deliveries.isLoading ? (
            <LoadingState label="Loading payment request activity" />
          ) : (
            <div>
              {activity.map((item, index) => (
                <div
                  key={item.id}
                  className="relative flex gap-4 pb-7 last:pb-0"
                >
                  <div className="relative pt-1">
                    <span
                      className={cn(
                        'block h-3 w-3 rounded-full border-2 bg-background',
                        item.tone === 'success'
                          ? 'border-primary'
                          : item.tone === 'danger'
                            ? 'border-[#bd5548]'
                            : 'border-[#87918d]',
                      )}
                    />
                    {index < activity.length - 1 && (
                      <span className="absolute left-[5px] top-5 h-[calc(100%-8px)] w-px bg-black/12" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 border-b border-black/[.06] pb-6">
                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <time className="text-[11px] text-muted">
                        {formatDate(item.occurredAt)}
                      </time>
                    </div>
                    {item.detail && (
                      <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted">
                        {item.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="sticky top-28 border-l-2 border-primary bg-[#f0f6f3] px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">
              Next best action
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-.025em]">
              {presentation.statusLabel}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              {presentation.statusDetail}
            </p>

            {p.status === 'PENDING' && (
              <div className="mt-5 space-y-4 border-t border-black/[.08] pt-5">
                {!originalRecipient && !currentEmail ? (
                  <Link
                    href={`/people/${p.customer.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white"
                  >
                    Add customer email{' '}
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                  </Link>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold">Recipient</label>
                      <select
                        value={recipient}
                        onChange={(event) =>
                          setRecipient(
                            event.target.value as 'ORIGINAL' | 'CURRENT',
                          )
                        }
                        className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-xs outline-none focus:border-primary"
                      >
                        {originalRecipient && (
                          <option value="ORIGINAL">
                            Original — {originalRecipient}
                          </option>
                        )}
                        {currentEmail &&
                          (!originalRecipient || recipientChanged) && (
                            <option value="CURRENT">
                              Current — {currentEmail}
                            </option>
                          )}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold">
                        Note{' '}
                        <span className="font-normal text-muted">
                          (optional)
                        </span>
                      </label>
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        maxLength={500}
                        rows={3}
                        className="mt-2 w-full resize-none rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!canSend || sendEmail.isPending}
                      onClick={() => sendEmail.mutate()}
                    >
                      <Mail className="h-4 w-4" />
                      {emailHistory.length ? 'Send again' : 'Send email'}
                    </Button>
                    {cooldownSeconds > 0 && (
                      <p className="text-[11px] text-muted">
                        Another send is available in {cooldownSeconds} seconds.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <dl className="mt-5 grid gap-3 border-t border-black/[.08] pt-5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Customer</dt>
                <dd className="text-right font-semibold">{p.customer.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd className="break-all text-right font-medium">
                  {p.customer.email ?? 'Not added'}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
