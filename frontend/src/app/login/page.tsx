'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Link2,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type Values = z.infer<typeof schema>;

const benefits = [
  { icon: UsersRound, label: 'Customer records' },
  { icon: Link2, label: 'Secure payment links' },
  { icon: CheckCircle2, label: 'Clear outcomes' },
];

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const { login, register, ready } = useAuth();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setError('');
    try {
      await (mode === 'login'
        ? login(values.email, values.password)
        : register(values.email, values.password));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Authentication failed',
      );
    }
  });

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[#171a21] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-36 -top-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <CircleDollarSign className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold">Relay</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[.17em] text-[#8398e9]">
            Payment requests
          </p>
          <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-.035em]">
            Request payment.
            <br /> Know what happens next.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-[#adb3bd]">
            Keep customers, secure payment links, and every payment outcome
            together in one focused place.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {benefits.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/[.04] p-4"
              >
                <Icon className="mb-4 h-5 w-5 text-[#8398e9]" />
                <p className="text-xs font-medium text-[#d9dce2]">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-[#6f7683]">
          A calmer way to collect and follow up.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
              <CircleDollarSign className="h-5 w-5" />
            </span>
            <span className="text-xl font-semibold">Relay</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-primary">
            {mode === 'login' ? 'Welcome back' : 'New workspace'}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.035em]">
            {mode === 'login' ? 'Sign in to Relay' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === 'login'
              ? 'Use your workspace owner credentials.'
              : 'You’ll become the owner of a new workspace.'}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-[#c03530]">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-[#c03530]">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            {error && (
              <p className="rounded-lg bg-[#fff0ee] px-3 py-2.5 text-xs text-[#b7332e]">
                {error}
              </p>
            )}
            <Button
              disabled={!ready || form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? (
                <Activity className="h-4 w-4 animate-spin" />
              ) : null}
              {mode === 'login' ? 'Sign in' : 'Create workspace'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {mode === 'login' ? 'New to Relay?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
                form.clearErrors();
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
