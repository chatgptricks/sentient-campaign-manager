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
        tone === 'neutral' && 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
        tone === 'info' && 'border-[#9fc4f2] bg-[#edf5ff] text-[#245d9e]',
        tone === 'attention' && 'border-[#efd18a] bg-[#fff8df] text-[#8a5b00]',
        tone === 'success' && 'border-[var(--acid)]/45 bg-[var(--acid)]/18 text-[var(--acid-ink)]',
        tone === 'danger' && 'border-[#efb2ae] bg-[#fff1f0] text-[#b42318]',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}
