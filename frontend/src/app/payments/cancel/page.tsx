import { CircleDollarSign, XCircle } from 'lucide-react';

export default function Cancel() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <CircleDollarSign className="h-5 w-5" />
          </span>
          Relay
        </div>
        <div className="mt-8 rounded-xl border border-[#f2d7a8] bg-[#fffbf2] p-5 text-center">
          <XCircle className="mx-auto h-11 w-11 text-[#a46500]" />
          <h1 className="mt-4 text-2xl font-semibold">Checkout canceled</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            No payment was confirmed. You can safely close this page or use the
            original payment link when you are ready to try again.
          </p>
        </div>
        <p className="mt-5 text-center text-xs leading-5 text-muted">
          If you did not expect to see this page, contact the business that sent
          you the payment request.
        </p>
      </div>
    </main>
  );
}
