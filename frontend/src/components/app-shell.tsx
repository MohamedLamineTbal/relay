'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  LogOut,
  Settings2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { GlobalSearch } from '@/components/global-search';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Home' },
  { href: '/collections', label: 'Payment requests' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { ready, workspace, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountOpen]);

  if (!ready || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Preparing your workspace…
        </div>
      </div>
    );
  }

  const isActive = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-black/[.08] bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-4 md:px-7">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 text-[#15211e]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
              <CircleDollarSign className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-.03em]">
              Relay
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Primary navigation"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium',
                  isActive(item.href)
                    ? 'bg-[#e5ede9] text-[#153d35]'
                    : 'text-[#65706c] hover:bg-black/[.035] hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <GlobalSearch />
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                aria-controls="account-menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                className="flex h-9 items-center gap-2 rounded-md py-1 pl-1 pr-2 text-muted hover:bg-black/[.045] hover:text-foreground"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d8e5df] text-[11px] font-bold text-primary">
                  {workspace.owner.email.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate text-xs font-semibold lg:block">
                  {workspace.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted" />
              </button>

              {accountOpen && (
                <div
                  id="account-menu"
                  role="menu"
                  className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-black/10 bg-[#f0eee7] p-2 shadow-[0_18px_60px_rgba(20,32,28,.16)]"
                >
                  <div className="flex items-start gap-2 border-b border-black/[.07] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {workspace.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {workspace.owner.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="Close account menu"
                      onClick={() => setAccountOpen(false)}
                      className="rounded-full p-1 text-muted hover:bg-black/5 hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Link
                    role="menuitem"
                    href="/stripe"
                    onClick={() => setAccountOpen(false)}
                    className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f4f4ef]"
                  >
                    <CreditCard className="h-4 w-4 text-muted" /> Payment
                    account
                  </Link>
                  <div className="mt-1 border-t border-black/[.07] pt-1">
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-[#fff2ef] hover:text-[#a83d33]"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-[1480px] gap-1 overflow-x-auto border-t border-black/[.06] px-3 py-2 md:hidden"
          aria-label="Mobile navigation"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium',
                isActive(item.href)
                  ? 'bg-[#e5ede9] text-[#153d35]'
                  : 'text-muted',
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/stripe"
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium text-muted"
          >
            <Settings2 className="h-3.5 w-3.5" /> Setup
          </Link>
        </nav>
      </header>

      <main className="page-enter mx-auto max-w-[1480px] px-4 py-7 md:px-7 md:py-10">
        {children}
      </main>
    </div>
  );
}
