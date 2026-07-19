import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Promotion } from '../../domain/models';
import { formatDate, formatRelativeTime } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { ContextMenu, type ContextMenuState } from '../../components/ui/ContextMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { PromotionStatusBadge } from './PromotionStatusBadge';
import { getCurrentOwnerName } from './presentation-helpers';

const columnHelper = createColumnHelper<Promotion>();

export function PromotionTable({
  promotions,
  emptyAction,
  onDelete,
}: {
  promotions: Promotion[];
  emptyAction?: ReactNode;
  onDelete?: (promotion: Promotion) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);
  const [menu, setMenu] = useState<(ContextMenuState & { promotion: Promotion }) | null>(null);
  const promotionById = useMemo(
    () => new Map(promotions.map((promotion) => [promotion.id, promotion])),
    [promotions],
  );
  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Promotion',
        cell: ({ row, getValue }) => (
          <div className="min-w-52">
            <Link
              className="font-semibold text-[var(--text)] hover:text-[var(--acid-ink)] focus-visible:underline focus-visible:outline-none"
              to={`/promotions/${row.original.id}`}
            >
              {getValue()}
            </Link>
            <p className="mt-1 text-xs text-[var(--text-dim)]">{row.original.clientName}</p>
          </div>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <PromotionStatusBadge status={info.getValue()} />,
      }),
      columnHelper.display({
        id: 'currentOwner',
        header: 'Current owner',
        cell: ({ row }) => getCurrentOwnerName(row.original),
      }),
      columnHelper.accessor('creatorName', {
        header: 'Creator',
        cell: (info) =>
          info.getValue() ?? <span className="text-[var(--text-dim)]">Unassigned</span>,
      }),
      columnHelper.accessor('dueDate', {
        header: 'Due date',
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Updated',
        cell: (info) => <span title={info.getValue()}>{formatRelativeTime(info.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'progress',
        header: 'Progress',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--text-muted)]">
            {row.original.status.replaceAll('_', ' ')}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: promotions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const openContextMenu = (event: MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest<HTMLElement>('[data-promotion-id]');
    const promotion = row ? promotionById.get(row.dataset.promotionId ?? '') : undefined;
    if (!promotion) return;

    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, promotion });
  };

  if (promotions.length === 0) {
    return (
      <EmptyState
        title="No promotions found"
        description="Adjust the filters or create the first promotion for this workspace."
        action={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="data-table" onContextMenuCapture={openContextMenu}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-sm hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:outline-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} data-promotion-id={row.original.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-4 py-3">
        <p className="text-xs text-[var(--text-dim)]">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·{' '}
          {promotions.length} total
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <ContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        groups={
          menu
            ? [
                {
                  items: [
                    {
                      label: 'Open promotion',
                      description: 'Go to the full workflow record.',
                      icon: <ExternalLink className="size-4" />,
                      onSelect: () => {
                        window.location.hash = `#/promotions/${menu.promotion.id}`;
                      },
                    },
                    {
                      label: 'Copy promotion ID',
                      description: 'Useful for debugging and audit references.',
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        void navigator.clipboard.writeText(menu.promotion.id);
                        toast.success('Promotion ID copied.');
                      },
                    },
                    {
                      label: 'Copy promotion summary',
                      description: 'Title, client, status, owner, and due date.',
                      icon: <Copy className="size-4" />,
                      onSelect: () => {
                        const summary = [
                          menu.promotion.title,
                          `Client: ${menu.promotion.clientName}`,
                          `Status: ${menu.promotion.status.replaceAll('_', ' ')}`,
                          `Owner: ${getCurrentOwnerName(menu.promotion)}`,
                          `Due: ${formatDate(menu.promotion.dueDate)}`,
                          `ID: ${menu.promotion.id}`,
                        ].join('\n');
                        void navigator.clipboard.writeText(summary);
                        toast.success('Promotion summary copied.');
                      },
                    },
                  ],
                },
                {
                  items: [
                    {
                      label: 'Delete promotion',
                      description:
                        'Cancels the promotion and removes it from the active list while preserving audit history.',
                      icon: <Trash2 className="size-4" />,
                      danger: true,
                      disabled: !onDelete || menu.promotion.status === 'CANCELLED',
                      onSelect: () => onDelete?.(menu.promotion),
                    },
                  ],
                },
              ]
            : []
        }
      />
    </>
  );
}
