'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Link2,
  Mail,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { Customer, PaymentRequest } from '@/lib/types';
import { cn, formatMoney } from '@/lib/utils';

const schema = z.object({
  amount: z.number().positive('Enter an amount').max(999999.99),
  description: z.string().trim().min(1, 'Add a purpose').max(500),
  internalReference: z.string().trim().max(120).optional(),
  message: z.string().max(500).optional(),
});

type Values = z.infer<typeof schema>;
type Delivery = 'EMAIL' | 'LINK';

export function CollectionComposer({
  initialCustomer,
  compact = false,
}: {
  initialCustomer?: Customer;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: api.customers,
  });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const customerPickerRef = useRef<HTMLDivElement>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('EMAIL');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [receipt, setReceipt] = useState<PaymentRequest | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const reduceMotion = useReducedMotion();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
      internalReference: '',
      message: '',
    },
  });
  const matchingCustomers = useMemo(() => {
    const normalized = customerQuery.trim().toLowerCase();
    if (!normalized) return (customers.data ?? []).slice(0, 6);
    return (customers.data ?? [])
      .filter((customer) =>
        `${customer.name} ${customer.email ?? ''}`
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 6);
  }, [customerQuery, customers.data]);

  useEffect(() => {
    if (!customerPickerOpen) return;

    const dismissPicker = () => {
      setCustomerPickerOpen(false);
      setCreatingCustomer(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!customerPickerRef.current?.contains(event.target as Node)) {
        dismissPicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissPicker();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [customerPickerOpen]);

  const closeCustomerPicker = () => {
    setCustomerPickerOpen(false);
    setCreatingCustomer(false);
  };

  const createCustomer = useMutation({
    mutationFn: () =>
      api.createCustomer({
        name: newCustomerName.trim(),
        ...(newCustomerEmail.trim()
          ? { email: newCustomerEmail.trim().toLowerCase() }
          : {}),
      }),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedCustomer(customer);
      setCreatingCustomer(false);
      setCustomerPickerOpen(false);
      setCustomerQuery('');
      setNewCustomerName('');
      setNewCustomerEmail('');
      toast.success(`${customer.name} added`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateEmail = useMutation({
    mutationFn: () =>
      api.updateCustomerEmail(selectedCustomer!.id, emailDraft.trim()),
    onSuccess: (customer) => {
      setSelectedCustomer(customer);
      setEmailDraft('');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer email added');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createCollection = useMutation({
    mutationFn: (values: Values) =>
      api.createPayment(
        {
          customerId: selectedCustomer!.id,
          amount: Math.round(values.amount * 100),
          description: values.description.trim(),
          ...(values.internalReference?.trim()
            ? { internalReference: values.internalReference.trim() }
            : {}),
          sendEmail: delivery === 'EMAIL',
          ...(delivery === 'EMAIL' && values.message?.trim()
            ? { message: values.message.trim() }
            : {}),
        },
        crypto.randomUUID(),
      ),
    onSuccess: (payment) => {
      setReceipt(payment);
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'ACTIVE'] });
      toast.success(
        payment.sendEmailRequested
          ? 'Payment request created and email queued'
          : 'Payment link created',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reset = () => {
    setReceipt(null);
    if (!initialCustomer) setSelectedCustomer(null);
    setDelivery('EMAIL');
    setDetailsOpen(false);
    form.reset({
      description: '',
      internalReference: '',
      message: '',
    });
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Checkout link copied', {
        description: 'Delivery remains unverified until the customer uses it.',
      });
    } catch {
      toast.error('Could not copy the checkout link');
    }
  };

  if (receipt) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-[#b9d8cd] bg-[#f6fcf9] shadow-[0_20px_70px_rgba(22,73,59,.08)]">
        <div className="grid gap-7 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                <Check className="h-3.5 w-3.5" />
              </span>
              Payment request created
            </div>
            <p className="text-sm text-muted">{receipt.customer.name}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-3xl font-semibold tracking-[-.045em] tabular-nums">
                {formatMoney(receipt.amount, receipt.currency)}
              </h2>
              <span className="text-sm text-muted">{receipt.description}</span>
            </div>
            {receipt.internalReference && (
              <p className="mt-1.5 text-xs text-muted">
                Internal reference: {receipt.internalReference}
              </p>
            )}
            <div className="mt-6 flex max-w-xl items-center">
              {[
                'Created',
                receipt.sendEmailRequested ? 'Email queued' : 'Link ready',
                'Payment pending',
              ].map((label, index) => (
                <div
                  key={label}
                  className="flex flex-1 items-center last:flex-none"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap text-[11px] font-semibold text-[#285f53]">
                    <span className="h-2 w-2 rounded-full bg-primary ring-4 ring-[#dcefe8]" />
                    {label}
                  </span>
                  {index < 2 && (
                    <span className="mx-3 h-px flex-1 bg-[#b9d8cd]" />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#5f756e]">
              {receipt.sendEmailRequested
                ? `Relay queued the link for ${receipt.customer.email}. Delivery updates will appear in the payment request activity.`
                : 'The link is ready. Copying it does not verify that the customer received it.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {receipt.checkoutUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyLink(receipt.checkoutUrl!)}
              >
                <Copy className="h-4 w-4" /> Copy link
              </Button>
            )}
            <Link
              href={`/collections/${receipt.publicId}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-[#105749]"
            >
              Open request <ArrowRight className="h-4 w-4" />
            </Link>
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> New request
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="collect"
      className={cn(
        'border-y border-black/[.09]',
        compact ? 'py-6' : 'py-7 md:py-9',
      )}
    >
      <div className="mx-auto mb-7 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-[-.03em]">
          New payment request
        </h2>
      </div>

      <form
        className="mx-auto max-w-2xl"
        onSubmit={form.handleSubmit((values) => {
          if (!selectedCustomer) {
            setCustomerPickerOpen(true);
            return;
          }
          createCollection.mutate(values);
        })}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          <div className="space-y-5">
            <div ref={customerPickerRef} className="relative min-w-0">
              <label
                htmlFor="collection-customer"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Customer
              </label>
              {selectedCustomer ? (
                <button
                  id="collection-customer"
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerPickerOpen(true);
                  }}
                  className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md bg-[#e3e8e2] px-3 text-left text-base font-semibold text-foreground outline-none transition-colors hover:bg-[#dbe3dc] focus:ring-2 focus:ring-primary/15"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d2e1da] text-primary">
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {selectedCustomer.name}
                  </span>
                  <X className="h-3.5 w-3.5 shrink-0 text-muted" />
                </button>
              ) : (
                <div className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md bg-[#ebe8df] px-3 transition-colors focus-within:bg-[#e1e7e1] focus-within:ring-2 focus-within:ring-primary/15">
                  <Search className="h-4 w-4 text-muted" />
                  <input
                    id="collection-customer"
                    role="combobox"
                    aria-controls="customer-picker"
                    aria-expanded={customerPickerOpen}
                    aria-haspopup="dialog"
                    value={customerQuery}
                    onFocus={() => setCustomerPickerOpen(true)}
                    onClick={() => setCustomerPickerOpen(true)}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value);
                      setCustomerPickerOpen(true);
                    }}
                    placeholder="Choose a customer"
                    className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-[#8f9691]"
                  />
                </div>
              )}

              {customerPickerOpen && !selectedCustomer && (
                <div
                  id="customer-picker"
                  role="dialog"
                  aria-label="Choose or add a customer"
                  className="absolute left-0 top-[calc(100%+8px)] z-20 w-[min(380px,calc(100vw-3rem))] overflow-hidden rounded-lg border border-black/[.09] bg-[#f1efe8] p-2 text-sm shadow-[0_18px_50px_rgba(17,32,27,.16)]"
                >
                  {creatingCustomer ? (
                    <div className="space-y-3 p-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCreatingCustomer(false)}
                          className="rounded-full p-1 text-muted hover:bg-black/5"
                          aria-label="Back to customer list"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <p className="flex-1 font-semibold">
                          Add a new customer
                        </p>
                        <button
                          type="button"
                          onClick={closeCustomerPicker}
                          className="rounded-full p-1 text-muted hover:bg-black/5"
                          aria-label="Close customer picker"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={newCustomerName}
                        onChange={(event) =>
                          setNewCustomerName(event.target.value)
                        }
                        placeholder="Customer name"
                        className="h-10 w-full rounded-md bg-[#e5e2d9] px-3 outline-none focus:ring-2 focus:ring-primary/15"
                      />
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(event) =>
                          setNewCustomerEmail(event.target.value)
                        }
                        placeholder="Email address (optional)"
                        className="h-10 w-full rounded-md bg-[#e5e2d9] px-3 outline-none focus:ring-2 focus:ring-primary/15"
                      />
                      <Button
                        type="button"
                        className="w-full"
                        disabled={
                          !newCustomerName.trim() || createCustomer.isPending
                        }
                        onClick={() => createCustomer.mutate()}
                      >
                        Add and continue
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 flex items-center justify-between px-3 py-1.5">
                        <p className="text-xs font-semibold text-muted">
                          Choose a customer
                        </p>
                        <button
                          type="button"
                          onClick={closeCustomerPicker}
                          className="rounded-full p-1 text-muted hover:bg-black/5"
                          aria-label="Close customer picker"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {matchingCustomers.map((customer) => (
                        <button
                          type="button"
                          key={customer.id}
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerPickerOpen(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#e3e5de]"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e5ede9] text-primary">
                            <UserRound className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {customer.name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {customer.email ?? 'No email address'}
                            </span>
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setNewCustomerName(customerQuery);
                          setCreatingCustomer(true);
                        }}
                        className="mt-1 flex w-full items-center gap-3 border-t border-black/[.07] px-3 py-3 text-left font-semibold text-primary hover:bg-[#e3e8e2]"
                      >
                        <Plus className="h-4 w-4" />
                        {customerQuery.trim()
                          ? `Add “${customerQuery.trim()}”`
                          : 'Add a new customer'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="relative min-w-0">
              <label
                htmlFor="collection-amount"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Amount
              </label>
              <div className="flex h-12 items-center rounded-md bg-[#ebe8df] px-3 transition-colors focus-within:bg-[#e1e7e1] focus-within:ring-2 focus-within:ring-primary/15">
                <span className="mr-1 text-lg font-semibold text-primary">
                  $
                </span>
                <input
                  id="collection-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={Boolean(form.formState.errors.amount)}
                  className="min-w-0 flex-1 bg-transparent text-xl font-semibold tabular-nums text-foreground outline-none placeholder:text-[#9a9e98]"
                  {...form.register('amount', { valueAsNumber: true })}
                />
                <span className="ml-2 text-[10px] font-semibold tracking-[.12em] text-primary">
                  USD
                </span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="collection-purpose"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Purpose
            </label>
            <div className="flex h-12 items-center rounded-md bg-[#ebe8df] px-3 transition-colors focus-within:bg-[#e1e7e1] focus-within:ring-2 focus-within:ring-primary/15">
              <input
                id="collection-purpose"
                placeholder="What is this payment for?"
                aria-invalid={Boolean(form.formState.errors.description)}
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-[#8f9691] sm:text-lg"
                {...form.register('description')}
              />
              <span className="ml-3 hidden text-[10px] font-medium uppercase tracking-[.12em] text-muted sm:block">
                Customer sees this
              </span>
            </div>
          </div>
        </motion.div>

        {(form.formState.errors.amount ||
          form.formState.errors.description ||
          form.formState.errors.internalReference) && (
          <p className="mt-3 text-xs font-medium text-[#a74035]">
            {form.formState.errors.amount?.message ??
              form.formState.errors.description?.message ??
              form.formState.errors.internalReference?.message}
          </p>
        )}

        <div className="mt-5">
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            className="inline-flex items-center gap-1.5 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                detailsOpen && 'rotate-90',
              )}
            />
            More details
          </button>
          <AnimatePresence initial={false}>
            {detailsOpen && (
              <motion.div
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="max-w-xl pt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label
                      htmlFor="collection-internal-reference"
                      className="text-xs font-medium text-muted"
                    >
                      Internal reference
                    </label>
                    <span className="text-[10px] uppercase tracking-[.1em] text-muted">
                      Only visible to you
                    </span>
                  </div>
                  <input
                    id="collection-internal-reference"
                    maxLength={120}
                    placeholder="Invoice 42"
                    className="h-10 w-full rounded-md bg-[#ebe8df] px-3 text-sm text-foreground outline-none placeholder:text-[#8f9691] focus:bg-[#e1e7e1] focus:ring-2 focus:ring-primary/15"
                    {...form.register('internalReference')}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {selectedCustomer &&
          delivery === 'EMAIL' &&
          !selectedCustomer.email && (
            <div className="mt-6 flex flex-col gap-3 border-l-2 border-[#bb8735] bg-[#efe7d7] px-4 py-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#72521d]">
                  Add an email to send this payment request
                </label>
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder="customer@example.com"
                  className="mt-2 h-10 w-full rounded-md bg-[#e4dbc9] px-3 text-sm outline-none focus:ring-2 focus:ring-[#b67b20]/20"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!emailDraft.trim() || updateEmail.isPending}
                onClick={() => updateEmail.mutate()}
              >
                Save email
              </Button>
            </div>
          )}

        <div className="mt-7 grid gap-5 border-t border-black/[.09] pt-6 lg:grid-cols-[240px_minmax(280px,1fr)_auto] lg:items-end">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">
              Send via
            </legend>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDelivery('EMAIL')}
                aria-pressed={delivery === 'EMAIL'}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                  delivery === 'EMAIL'
                    ? 'bg-[#dce7e1] text-primary'
                    : 'text-muted hover:bg-black/[.035] hover:text-foreground',
                )}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
              <button
                type="button"
                onClick={() => setDelivery('LINK')}
                aria-pressed={delivery === 'LINK'}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                  delivery === 'LINK'
                    ? 'bg-[#dce7e1] text-primary'
                    : 'text-muted hover:bg-black/[.035] hover:text-foreground',
                )}
              >
                <Link2 className="h-3.5 w-3.5" /> Link only
              </button>
            </div>
          </fieldset>

          <AnimatePresence mode="wait" initial={false}>
            {delivery === 'EMAIL' ? (
              <motion.div
                key="email-message"
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                <label
                  htmlFor="collection-message"
                  className="mb-2 block text-xs font-medium text-muted"
                >
                  Add a message <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="collection-message"
                  rows={1}
                  maxLength={500}
                  placeholder="A short note for the customer"
                  className="h-10 w-full resize-none border-b border-black/15 bg-transparent px-1 py-2 text-sm leading-5 outline-none placeholder:text-[#8f9691] focus:border-primary"
                  {...form.register('message')}
                />
              </motion.div>
            ) : (
              <motion.p
                key="link-message"
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="pb-2 text-xs text-muted"
              >
                You’ll get a checkout link to share yourself.
              </motion.p>
            )}
          </AnimatePresence>

          <div className="lg:text-right">
            {selectedCustomer && (
              <p className="mb-1.5 max-w-56 truncate text-xs text-muted lg:ml-auto">
                {delivery === 'EMAIL'
                  ? selectedCustomer.email
                    ? selectedCustomer.email
                    : 'Add an email before sending'
                  : 'Share manually'}
              </p>
            )}
            <Button
              type="submit"
              className="whitespace-nowrap px-5"
              disabled={
                createCollection.isPending ||
                (delivery === 'EMAIL' && !selectedCustomer?.email)
              }
            >
              {delivery === 'EMAIL' ? (
                <Mail className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {delivery === 'EMAIL' ? 'Create and send' : 'Create link'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
