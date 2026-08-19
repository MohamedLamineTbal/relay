'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Mail, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CollectionComposer } from '@/components/collection-composer';
import { CollectionRow } from '@/components/collection-row';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/utils';

function totalsByCurrency(
  collections: Array<{ amount: number; currency: string }>,
) {
  const totals = new Map<string, number>();
  collections.forEach((collection) => {
    const currency = collection.currency.toLowerCase();
    totals.set(currency, (totals.get(currency) ?? 0) + collection.amount);
  });
  return [...totals.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export default function CustomerDossierPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const queryClient = useQueryClient();
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState('');
  const dossier = useQuery({
    queryKey: ['customer-dossier', id],
    queryFn: () => api.customerDossier(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const updateEmail = useMutation({
    mutationFn: () => api.updateCustomerEmail(id, email.trim()),
    onSuccess: () => {
      setEditingEmail(false);
      setEmail('');
      void queryClient.invalidateQueries({
        queryKey: ['customer-dossier', id],
      });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Customer email updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const collections = useMemo(
    () => dossier.data?.collections ?? [],
    [dossier.data?.collections],
  );
  const paidTotals = totalsByCurrency(
    collections.filter((collection) => collection.status === 'PAID'),
  );
  const openTotals = totalsByCurrency(
    collections.filter((collection) => collection.status === 'PENDING'),
  );

  if (dossier.isLoading)
    return <LoadingState label="Opening customer dossier" />;
  if (dossier.error || !dossier.data) {
    return (
      <ErrorState
        message={(dossier.error as Error)?.message ?? 'Customer not found'}
      />
    );
  }

  const customer = dossier.data.customer;

  return (
    <>
      <Link
        href="/collections"
        className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to payment requests
      </Link>

      <header className="border-b border-black/10 pb-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#dfece6] text-lg font-semibold text-primary">
              {customer.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
              Customer dossier
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">
              {customer.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {customer.email ?? 'No email address'}
              </span>
              <span>Customer since {formatDate(customer.createdAt)}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEmail(customer.email ?? '');
              setEditingEmail(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Edit email
          </Button>
        </div>

        {editingEmail && (
          <div className="mt-6 flex max-w-xl flex-col gap-3 border-l-2 border-primary bg-[#f0f6f3] p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold">
                Current contact email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!email.trim() || updateEmail.isPending}
                onClick={() => updateEmail.mutate()}
              >
                <Check className="h-4 w-4" /> Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingEmail(false)}
              >
                <X className="h-4 w-4" /> Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-7 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Currently open</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {openTotals.length ? (
                openTotals.map(([currency, amount]) => (
                  <p
                    key={currency}
                    className="text-xl font-semibold tracking-[-.035em]"
                  >
                    {formatMoney(amount, currency)}
                  </p>
                ))
              ) : (
                <p className="text-xl font-semibold">—</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted">Currently paid</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {paidTotals.length ? (
                paidTotals.map(([currency, amount]) => (
                  <p
                    key={currency}
                    className="text-xl font-semibold tracking-[-.035em]"
                  >
                    {formatMoney(amount, currency)}
                  </p>
                ))
              ) : (
                <p className="text-xl font-semibold">—</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted">Payment request history</p>
            <p className="mt-1 text-xl font-semibold tracking-[-.035em]">
              {collections.length}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-10">
        <CollectionComposer
          key={`${customer.id}-${customer.email ?? 'no-email'}`}
          initialCustomer={customer}
          compact
        />
      </section>

      <section className="mt-12">
        <div className="border-b border-black/10 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
            Chapters
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">
            Payment request history
          </h2>
        </div>
        {!collections.length ? (
          <p className="py-8 text-sm text-muted">
            This customer does not have any payment requests yet.
          </p>
        ) : (
          collections.map((collection) => (
            <CollectionRow key={collection.publicId} payment={collection} />
          ))
        )}
      </section>
    </>
  );
}
