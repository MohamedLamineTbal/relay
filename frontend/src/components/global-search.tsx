'use client';

import { useQuery } from '@tanstack/react-query';
import { Command, Search, UserRound, WalletCards, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: api.customers,
    enabled: open,
  });
  const payments = useQuery({
    queryKey: ['payments'],
    queryFn: api.payments,
    enabled: open,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return { customers: [], payments: [] };
    return {
      customers: (customers.data ?? [])
        .filter((customer) =>
          `${customer.name} ${customer.email ?? ''}`
            .toLowerCase()
            .includes(normalized),
        )
        .slice(0, 4),
      payments: (payments.data ?? [])
        .filter((payment) =>
          `${payment.description} ${payment.internalReference ?? ''} ${payment.publicId} ${payment.customer.name}`
            .toLowerCase()
            .includes(normalized),
        )
        .slice(0, 5),
    };
  }, [customers.data, normalized, payments.data]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-black/[.045] hover:text-foreground sm:w-auto sm:gap-2 sm:px-2.5"
        aria-label="Search payment requests and customers"
      >
        <Search className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">Search</span>
        <span className="hidden items-center gap-1 text-[10px] text-[#8a918e] lg:flex">
          <Command className="h-3 w-3" /> K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-[#12201c]/35 px-4 pt-[12vh] backdrop-blur-sm">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-black/10 bg-[#f0eee7] shadow-[0_30px_90px_rgba(10,27,22,.24)]">
            <div className="flex items-center gap-3 border-b border-black/[.08] px-5">
              <Search className="h-5 w-5 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a customer, payment request, or reference"
                className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#9aa29e]"
              />
              <button
                type="button"
                onClick={close}
                className="rounded-full p-2 text-muted hover:bg-black/5 hover:text-foreground"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-3">
              {!normalized ? (
                <p className="px-3 py-10 text-center text-sm text-muted">
                  Search by customer, payment purpose, or request ID.
                </p>
              ) : !results.customers.length && !results.payments.length ? (
                <p className="px-3 py-10 text-center text-sm text-muted">
                  No matching customers or payment requests.
                </p>
              ) : (
                <div className="space-y-4">
                  {!!results.customers.length && (
                    <section>
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[#8b938f]">
                        People
                      </p>
                      {results.customers.map((customer) => (
                        <Link
                          key={customer.id}
                          href={`/people/${customer.id}`}
                          onClick={close}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f2f3ee]"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5ede9] text-primary">
                            <UserRound className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">
                              {customer.name}
                            </span>
                            <span className="block text-xs text-muted">
                              {customer.email ?? 'No email address'}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </section>
                  )}

                  {!!results.payments.length && (
                    <section>
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[#8b938f]">
                        Payment requests
                      </p>
                      {results.payments.map((payment) => (
                        <Link
                          key={payment.publicId}
                          href={`/collections/${payment.publicId}`}
                          onClick={close}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f2f3ee]"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeae1] text-[#796745]">
                            <WalletCards className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {payment.description}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {payment.internalReference
                                ? `${payment.internalReference} · `
                                : ''}
                              {payment.customer.name} · {payment.status}
                            </span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatMoney(payment.amount, payment.currency)}
                          </span>
                        </Link>
                      ))}
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
