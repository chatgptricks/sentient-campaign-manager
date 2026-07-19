import { useEffect, type ReactNode } from 'react';

import { cn } from '../../lib/utils';

export interface ContextMenuItem {
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
}

export function ContextMenu({
  state,
  groups,
  onClose,
}: {
  state: ContextMenuState | null;
  groups: ContextMenuGroup[];
  onClose(): void;
}) {
  useEffect(() => {
    if (!state) return;

    const close = () => onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose, state]);

  if (!state) return null;

  const left = Math.min(state.x, window.innerWidth - 280);
  const top = Math.min(state.y, window.innerHeight - 360);

  return (
    <div
      role="menu"
      className="fixed z-[70] w-68 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1.5 shadow-2xl"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, groupIndex) => (
        <div
          key={groupIndex}
          className={cn(groupIndex > 0 && 'mt-1 border-t border-[var(--border)] pt-1')}
        >
          {group.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none',
                item.danger
                  ? 'text-[#b42318] hover:bg-[#fff1f0]'
                  : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
                item.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
              )}
              onClick={(event) => {
                if (event.detail !== 0) return;
                if (item.disabled) return;
                onClose();
                item.onSelect();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (item.disabled) return;
                onClose();
                item.onSelect();
              }}
            >
              {item.icon ? <span className="mt-0.5 shrink-0">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-dim)]">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
