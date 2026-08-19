import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
          'bg-primary text-white shadow-sm hover:bg-[#105749]',
        variant === 'secondary' &&
          'bg-[#e2eee9] text-[#155447] hover:bg-[#d7e8e1]',
        variant === 'outline' &&
          'border bg-[#fffefa] text-foreground hover:bg-[#f2f2ed]',
        variant === 'ghost' &&
          'text-muted hover:bg-black/5 hover:text-foreground',
        variant === 'danger' && 'bg-[#d83b49] text-white hover:bg-[#bd2d3a]',
        size === 'sm'
          ? 'h-8 px-3 text-xs'
          : size === 'icon'
            ? 'h-9 w-9'
            : 'h-10 px-4 text-sm',
        className,
      )}
      {...props}
    />
  );
}
