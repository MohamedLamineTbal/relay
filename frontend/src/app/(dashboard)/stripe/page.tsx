'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Landmark,
  LoaderCircle,
  Unplug,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import type { StripeAccountSummary, StripeConnectStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

function countryName(country: string | null) {
  if (!country) return 'Country not available';
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country
    );
  } catch {
    return country;
  }
}

function accountMeta(account: StripeAccountSummary) {
  return [
    account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1),
    countryName(account.country),
    account.defaultCurrency?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(' · ');
}

function useRedirectMutation(
  action: () => Promise<{ url: string }>,
  failureMessage: string,
) {
  const mutation = useMutation<
    { url: string; target: Window | null },
    Error,
    Window | null
  >({
    mutationFn: async (target) => ({ ...(await action()), target }),
    onSuccess: ({ url, target }) => {
      if (target) {
        target.location.replace(url);
        return;
      }

      window.location.assign(url);
    },
    onError: (error, target) => {
      target?.close();
      toast.error(error.message || failureMessage);
    },
  });

  const openInNewTab = () => {
    const target = window.open('about:blank', '_blank');

    if (!target) {
      toast.error('Allow pop-ups to open Stripe in a new tab.');
      return;
    }

    target.opener = null;
    mutation.mutate(target);
  };

  const continueHere = () => mutation.mutate(null);

  return { ...mutation, openInNewTab, continueHere };
}

function StripeMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] bg-[#635bff] text-lg font-black italic text-white shadow-[0_8px_24px_rgba(99,91,255,.2)]',
        className,
      )}
      aria-hidden="true"
    >
      S
    </span>
  );
}

function StatusSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none">
      <div className="h-3 w-28 rounded-full bg-black/[.06]" />
      <div className="mt-5 h-10 w-80 max-w-full rounded-xl bg-black/[.07]" />
      <div className="mt-4 h-4 w-[28rem] max-w-full rounded-full bg-black/[.05]" />
      <div className="mt-10 h-72 rounded-[28px] border border-black/[.06] bg-white/60" />
      <div className="mt-5 h-36 rounded-[24px] border border-black/[.06] bg-white/45" />
    </div>
  );
}

function MoneyPath({ ready }: { ready: boolean }) {
  const reduceMotion = useReducedMotion();
  const nodes = [
    { label: 'Customer pays', detail: 'Secure checkout', icon: UserRound },
    {
      label: 'Stripe processes',
      detail: 'Payment confirmed',
      icon: CreditCard,
    },
    { label: 'Your balance', detail: 'Funds arrive here', icon: Landmark },
  ];

  return (
    <section
      aria-label="Payment path"
      className="overflow-hidden rounded-[24px] border border-black/[.08] bg-[#eeeee8]/65 px-5 py-5 sm:px-7"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-foreground">Money path</p>
          <p className="mt-1 text-xs text-muted">
            One clear route from your customer to your Stripe balance.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 text-[11px] font-medium text-muted sm:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secured by Stripe
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_72px_1fr_72px_1fr] md:items-center">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.label} className="contents">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduceMotion ? 0 : index * 0.08,
                  duration: reduceMotion ? 0 : 0.24,
                }}
                className="flex items-center gap-3 rounded-2xl bg-[#fffefa] px-4 py-3.5 shadow-[0_1px_2px_rgba(18,31,27,.05)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e3eee9] text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-semibold">
                    {node.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {node.detail}
                  </span>
                </span>
              </motion.div>

              {index < nodes.length - 1 && (
                <div className="relative hidden h-px overflow-hidden bg-black/10 md:block">
                  {ready && !reduceMotion && (
                    <motion.span
                      className="absolute -top-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(23,107,91,.12)]"
                      animate={{ left: ['-8px', '72px'] }}
                      transition={{
                        duration: 1.8,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        repeatDelay: 1.1,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AccountIdentity({
  account,
  label,
}: {
  account: StripeAccountSummary;
  label?: string;
}) {
  return (
    <div className="min-w-0">
      {label && (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">
          {label}
        </p>
      )}
      <p className="truncate text-base font-semibold tracking-[-.02em]">
        {account.displayName}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {accountMeta(account)}
      </p>
      <p className="mt-2 font-mono text-[11px] text-[#7d8581]">
        {account.maskedId}
      </p>
    </div>
  );
}

function SwitchAccountDialog({
  open,
  onOpenChange,
  status,
  onStartReplacement,
  startingReplacement,
  onActivateReplacement,
  activatingReplacement,
  onCancelReplacement,
  cancellingReplacement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StripeConnectStatus;
  onStartReplacement: () => void;
  startingReplacement: boolean;
  onActivateReplacement: () => void;
  activatingReplacement: boolean;
  onCancelReplacement: () => void;
  cancellingReplacement: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const replacement = status.replacement;
  const title = replacement
    ? replacement.paymentsReady
      ? 'New account ready'
      : 'Finish switching account'
    : 'Switch Stripe account';
  const description = replacement
    ? 'Your current account stays active until you finish the switch.'
    : 'Connect the replacement before anything changes.';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-[#12201b]/25 backdrop-blur-[2px]"
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.aside
            initial={reduceMotion ? false : { opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-black/10 bg-[#fbfaf6] p-6 shadow-[-24px_0_80px_rgba(17,29,25,.18)] sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <Dialog.Title className="text-xl font-semibold tracking-[-.035em]">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm leading-6 text-muted">
                  {description}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close connection settings"
                  className="rounded-full p-2 text-muted hover:bg-black/5 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {replacement ? (
                <motion.div
                  key="pending"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-8"
                >
                  <div className="flex items-center gap-3 rounded-2xl border border-black/[.08] bg-white/70 p-4">
                    <StripeMark className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted">
                        New account
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold">
                        {replacement.displayName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    {replacement.paymentsReady ? (
                      <Button
                        onClick={onActivateReplacement}
                        disabled={activatingReplacement}
                      >
                        {activatingReplacement ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Use this account
                      </Button>
                    ) : (
                      <Button
                        onClick={onStartReplacement}
                        disabled={startingReplacement}
                      >
                        {startingReplacement && (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        )}
                        Continue with Stripe
                        {!startingReplacement && (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={onCancelReplacement}
                      disabled={cancellingReplacement}
                    >
                      Cancel switch
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="confirm"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-8"
                >
                  {status.account && (
                    <p className="text-sm text-muted">
                      Current account:{' '}
                      <span className="font-semibold text-foreground">
                        {status.account.displayName}
                      </span>
                    </p>
                  )}
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={onStartReplacement}
                      disabled={startingReplacement}
                    >
                      {startingReplacement ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      Continue to Stripe
                    </Button>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function StripePage() {
  const { workspace } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [switchOpen, setSwitchOpen] = useState(false);
  const handledReturn = useRef(false);
  const status = useQuery({
    queryKey: ['stripe-status'],
    queryFn: api.stripeStatus,
  });

  const onboard = useRedirectMutation(
    api.startStripeOnboarding,
    'Could not open Stripe onboarding',
  );
  const openStripe = useRedirectMutation(
    api.openStripeDashboard,
    'Could not open Stripe',
  );
  const replace = useRedirectMutation(
    api.startStripeReplacement,
    'Could not start the account replacement',
  );
  const activateReplacement = useMutation({
    mutationFn: api.activateStripeReplacement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stripe-status'] });
      toast.success('Stripe account changed for new payment requests');
      setSwitchOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelReplacement = useMutation({
    mutationFn: api.cancelStripeReplacement,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stripe-status'] });
      toast.success(
        'Replacement cancelled. Your current account is unchanged.',
      );
      setSwitchOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const onboardingAction = params.get('onboarding');
    const replacementAction = params.get('replacement');
    if (!onboardingAction && !replacementAction) return;

    handledReturn.current = true;
    window.history.replaceState(null, '', window.location.pathname);

    if (replacementAction === 'refresh') {
      replace.continueHere();
      return;
    }
    if (onboardingAction === 'refresh') {
      onboard.continueHere();
      return;
    }

    if (replacementAction === 'return') {
      queueMicrotask(() => setSwitchOpen(true));
      toast.success('Replacement verified. Checking whether it is ready…');
    } else {
      toast.success('Returned from Stripe. Checking account status…');
    }
    void status.refetch();
  }, [onboard, replace, status]);

  if (status.isLoading) return <StatusSkeleton />;
  if (status.error || !status.data) {
    return (
      <ErrorState
        message={(status.error as Error)?.message ?? 'Unable to load Stripe'}
      />
    );
  }

  const data = status.data;
  const account = data.account;
  const ready = data.paymentsReady && Boolean(account);
  const checkedTime = new Date(data.checkedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!data.connected || !account) {
    const connectionEnded = data.connectionIssue === 'ACCOUNT_UNAVAILABLE';
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">
          Payment account
        </p>
        <div className="mt-3 grid gap-8 lg:grid-cols-[1fr_.8fr] lg:items-center">
          <div>
            <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.08] tracking-[-.055em] sm:text-5xl">
              {connectionEnded
                ? 'Your Stripe connection ended.'
                : 'Give your payments somewhere to land.'}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
              {connectionEnded
                ? 'The previous account is no longer available. Your completed payments and existing history are safe—connect another Stripe account to create new payment requests.'
                : 'Connect Stripe once. Relay will create secure checkout links and keep each payment journey visible from request to receipt.'}
            </p>
            <Button
              className="mt-7"
              disabled={onboard.isPending}
              onClick={onboard.openInNewTab}
            >
              {onboard.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <StripeMark className="h-5 w-5 rounded-md text-[10px] shadow-none" />
              )}
              {connectionEnded
                ? 'Connect another Stripe account'
                : 'Connect with Stripe'}
            </Button>
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12, rotate: 1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            className="relative overflow-hidden rounded-[30px] border border-black/[.08] bg-[#e8ece7] p-7 shadow-[0_22px_70px_rgba(23,38,32,.1)]"
          >
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#cfcaff]/55 blur-3xl" />
            <div className="relative rounded-[22px] bg-[#fffefa] p-6 shadow-[0_14px_40px_rgba(23,38,32,.1)]">
              <div className="flex items-center gap-3">
                <StripeMark className="h-11 w-11" />
                <div>
                  <p className="text-sm font-semibold">Stripe account</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {connectionEnded ? 'Connection ended' : 'Not connected yet'}
                  </p>
                </div>
              </div>
              <div className="mt-9 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-black/10" />
                {connectionEnded ? (
                  <Unplug className="h-4 w-4 text-[#a85a46]" />
                ) : (
                  <Sparkles className="h-4 w-4 text-[#635bff]" />
                )}
                <span className="h-px flex-1 bg-black/10" />
              </div>
              <p className="mt-7 text-xs leading-5 text-muted">
                {connectionEnded
                  ? 'Relay has stopped sending new payments to the unavailable account.'
                  : 'Business verification and payout details stay with Stripe.'}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">
            Payment account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.05em] sm:text-[38px]">
            {ready ? 'Payments are connected.' : 'Stripe needs your attention.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            {ready
              ? `New payment requests from ${workspace?.name ?? 'your workspace'} flow into this Stripe account.`
              : 'Continue verification with Stripe before creating new payment requests.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ready && (
            <Button
              variant="outline"
              disabled={openStripe.isPending}
              onClick={openStripe.openInNewTab}
            >
              {openStripe.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Open Stripe
            </Button>
          )}
          {data.replacement ? (
            <Button onClick={() => setSwitchOpen(true)}>
              Finish switching <ArrowRight className="h-4 w-4" />
            </Button>
          ) : ready ? (
            <Button variant="ghost" onClick={() => setSwitchOpen(true)}>
              Switch account
            </Button>
          ) : (
            <Button disabled={onboard.isPending} onClick={onboard.openInNewTab}>
              Continue verification <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 9 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28 }}
        className="relative mt-9 overflow-hidden rounded-[30px] border border-black/[.09] bg-[#fffefa] px-6 py-6 shadow-[0_18px_60px_rgba(23,38,32,.07)] sm:px-8 sm:py-8"
      >
        <div
          className={cn(
            'absolute right-0 top-0 h-48 w-48 rounded-full blur-3xl',
            ready ? 'bg-[#cce8db]/60' : 'bg-[#f1dfb7]/55',
          )}
        />
        <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <StripeMark className="h-12 w-12 shrink-0" />
            <AccountIdentity
              account={account}
              label="Connected Stripe account"
            />
          </div>

          <motion.div
            key={ready ? 'ready' : 'attention'}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold',
              ready
                ? 'bg-[#e2f2e9] text-[#176a4a]'
                : 'bg-[#fbf1d8] text-[#85671e]',
            )}
          >
            {ready ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {ready ? 'Ready for payments' : 'Verification incomplete'}
          </motion.div>
        </div>

        <div className="relative mt-9 grid gap-4 border-t border-black/[.08] pt-6 text-xs sm:grid-cols-3">
          <div>
            <p className="text-muted">Payments</p>
            <p className="mt-1.5 font-semibold">
              {account.paymentsReady ? 'Accepting payments' : 'Not ready'}
            </p>
          </div>
          <div>
            <p className="text-muted">Payouts</p>
            <p className="mt-1.5 font-semibold">
              {account.payoutsReady ? 'Enabled' : 'Check with Stripe'}
            </p>
          </div>
          <div>
            <p className="text-muted">Last checked</p>
            <p className="mt-1.5 font-semibold">Today at {checkedTime}</p>
          </div>
        </div>
      </motion.section>

      <div className="mt-5">
        <MoneyPath ready={ready} />
      </div>

      <div className="mt-6 flex items-start gap-3 px-1 text-xs leading-5 text-muted">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          New requests use this account. Existing payment links and their
          history always remain attached to the Stripe account that created
          them.
        </p>
      </div>

      <SwitchAccountDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        status={data}
        onStartReplacement={replace.openInNewTab}
        startingReplacement={replace.isPending}
        onActivateReplacement={() => activateReplacement.mutate()}
        activatingReplacement={activateReplacement.isPending}
        onCancelReplacement={() => cancelReplacement.mutate()}
        cancellingReplacement={cancelReplacement.isPending}
      />
    </div>
  );
}
