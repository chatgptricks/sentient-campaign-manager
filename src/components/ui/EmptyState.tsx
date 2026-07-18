import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-52 place-items-center px-6 py-12 text-center">
      <div className="max-w-sm">
        {icon ? (
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-lg bg-white/6 text-[var(--acid)]">
            {icon}
          </div>
        ) : null}
        <h3 className="font-semibold text-[var(--text)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
