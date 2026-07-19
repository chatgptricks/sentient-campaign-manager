import type { ReactNode } from 'react';

import { Card } from './Card';

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute top-0 right-0 h-24 w-24 translate-x-7 -translate-y-7 rounded-full bg-[var(--acid)]/7 blur-2xl" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.13em] text-[var(--text-dim)] uppercase">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text)]">
            {value}
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{detail}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-lg border border-[var(--acid)]/20 bg-[var(--acid)]/8 text-[var(--acid-ink)]">
          {icon}
        </div>
      </div>
    </Card>
  );
}
