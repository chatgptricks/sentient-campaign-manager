import type { PropsWithChildren, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: PropsWithChildren<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
}>) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=closed]:animate-out data-[state=open]:animate-in fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-2xl focus:outline-none">
          <div className="border-b border-[var(--border)] px-6 py-5 pr-14">
            <DialogPrimitive.Title className="text-lg font-semibold text-[var(--text)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <div className="p-6">{children}</div>
          <DialogPrimitive.Close className="absolute top-4 right-4 grid size-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-white/8 hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
