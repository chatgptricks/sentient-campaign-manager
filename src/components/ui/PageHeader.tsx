import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-[var(--acid-ink)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--text)]">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
