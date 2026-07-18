import { AlertTriangle } from 'lucide-react';

import { Button } from './Button';

export function ErrorState({
  title = 'Something went wrong',
  message,
  retry,
  correlationId,
}: {
  title?: string;
  message: string;
  retry?: () => void;
  correlationId?: string;
}) {
  return (
    <div className="rounded-xl border border-red-400/25 bg-red-400/8 p-6" role="alert">
      <AlertTriangle className="mb-4 size-6 text-red-300" aria-hidden="true" />
      <h2 className="font-semibold text-[var(--text)]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{message}</p>
      {correlationId ? (
        <p className="mt-3 font-mono text-xs text-[var(--text-dim)]">Reference: {correlationId}</p>
      ) : null}
      {retry ? (
        <Button className="mt-5" variant="secondary" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
