import { useMemo, useState } from 'react';
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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import type { Promotion } from '../../domain/models';
import { formatDate, formatRelativeTime } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PromotionStatusBadge } from './PromotionStatusBadge';

const columnHelper = createColumnHelper<Promotion>();

export function PromotionTable({
  promotions,
  emptyAction,
}: {
  promotions: Promotion[];
  emptyAction?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);
  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Promotion',
        cell: ({ row, getValue }) => (
          <div className="min-w-52">
            <Link
              className="font-semibold text-[var(--text)] hover:text-[var(--acid)] focus-visible:underline focus-visible:outline-none"
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
      columnHelper.accessor('salesOwnerName', {
        header: 'Sales owner',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('creatorName', {
        header: 'Creator',
        cell: (info) =>
          info.getValue() ?? <span className="text-[var(--text-dim)]">Unassigned</span>,
      }),
      columnHelper.accessor('approverName', {
        header: 'Approver',
        cell: (info) =>
          info.getValue() ?? <span className="text-[var(--text-dim)]">Unassigned</span>,
      }),
      columnHelper.accessor('publisherName', {
        header: 'Publisher',
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
        <table className="data-table">
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
              <tr key={row.id}>
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
    </>
  );
}
