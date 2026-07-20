import { AlertTriangle } from 'lucide-react';

import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogState {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: 'default' | 'danger';
  onConfirm(): void;
}

export function ConfirmDialog({
  state,
  pending = false,
  onOpenChange,
}: {
  state: ConfirmDialogState | null;
  pending?: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog
      open={Boolean(state)}
      onOpenChange={onOpenChange}
      title={state?.title ?? 'Confirm action'}
      description={state?.description}
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-lg border ${
            state?.intent === 'danger'
              ? 'border-[#efb2ae] bg-[#fff1f0] text-[#b42318]'
              : 'border-[var(--acid)]/25 bg-[var(--acid)]/8 text-[var(--acid-ink)]'
          }`}
        >
          <AlertTriangle className="size-5" />
        </div>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          This action will be written to the workflow history.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          {state?.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          type="button"
          variant={state?.intent === 'danger' ? 'danger' : 'primary'}
          disabled={pending}
          onClick={state?.onConfirm}
        >
          {pending ? 'Working…' : (state?.confirmLabel ?? 'Confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
