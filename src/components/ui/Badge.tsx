import type { PropsWithChildren } from 'react';

import { cn } from '../../lib/utils';

interface BadgeProps extends PropsWithChildren {
  tone?: 'neutral' | 'info' | 'attention' | 'success' | 'danger';
  className?: string;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase',
        tone === 'neutral' && 'border-white/12 bg-white/5 text-[var(--text-muted)]',
        tone === 'info' && 'border-sky-400/25 bg-sky-400/10 text-sky-300',
        tone === 'attention' && 'border-amber-400/25 bg-amber-400/10 text-amber-300',
        tone === 'success' && 'border-[var(--acid)]/25 bg-[var(--acid)]/10 text-[var(--acid)]',
        tone === 'danger' && 'border-red-400/25 bg-red-400/10 text-red-300',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
