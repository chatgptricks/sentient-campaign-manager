import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-[0_24px_70px_rgba(0,0,0,0.16)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
