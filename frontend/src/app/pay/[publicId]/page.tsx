'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Clock3 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';

export default function PublicPayment() {
  const { publicId } = useParams<{ publicId: string }>();
  const payment = useQuery({
    queryKey: ['public-payment', publicId],
    queryFn: () => api.publicPayment(publicId),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-6">
      {payment.isLoading ? (
        <LoadingState label="Loading payment request" />
      ) : payment.error || !payment.data ? (
        <div className="w-full max-w-md">
          <ErrorState message="Payment request not found" />
        </div>
      ) : (
        <div className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              Relay
            </div>
            <StatusBadge value={payment.data.status} />
          </div>
          <div className="mt-9">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-primary">
              Payment request from {payment.data.businessName}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {payment.data.description}
            </h1>
            <p className="mt-3 text-3xl font-semibold tabular-nums">
              {formatMoney(payment.data.amount, payment.data.currency)}
            </p>
            <div className="mt-8 flex items-start gap-2 rounded-lg bg-[#f6f7f9] p-3 text-xs leading-5 text-muted">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              This page shows the current payment status. Contact the business
              if you have questions about this request.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
