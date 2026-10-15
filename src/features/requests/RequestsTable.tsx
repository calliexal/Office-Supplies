import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RequestListItem } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatTime, pluralize } from '@/lib/format';

type Row = RequestListItem & { requester?: { name: string; department: string } };

type RequestsTableProps = {
  rows: Row[] | undefined;
  isLoading: boolean;
  skeletonRows?: number;
  onOpenDetail: (id: string) => void;
  caption: string;
  emptyState: ReactNode;
  showRequester?: boolean;
  actionLabel?: string;
};

const BASE_COLUMNS = ['Request ID', 'Date', 'Time', 'Items', 'Total Quantity', 'Pickup Location', 'Status'];
const cell = 'whitespace-nowrap px-[14px] pt-[13px]';

export const RequestsTable = ({
  rows,
  isLoading,
  skeletonRows = 5,
  onOpenDetail,
  caption,
  emptyState,
  showRequester = false,
  actionLabel = 'View details of',
}: RequestsTableProps) => {
  if (!isLoading && rows?.length === 0) return <>{emptyState}</>;

  const columns = showRequester ? ['Request ID', 'Requested By', ...BASE_COLUMNS.slice(1)] : BASE_COLUMNS;

  return (
    <div className="relative -mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm font-medium">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-ink-600">
            {columns.map((column) => (
              <th key={column} scope="col" className="border-b border-ink-600 px-[14px] pb-2 font-medium first:pl-[14px]">
                {column}
              </th>
            ))}
            <th scope="col" className="border-b border-ink-600 pb-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-black">
          {isLoading && !rows
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <tr key={index}>
                  {Array.from({ length: columns.length + 1 }, (__, i) => (
                    <td key={i} className="px-[14px] pt-[13px]">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={row.id}>
                  <td className={cell}>{row.code}</td>
                  {showRequester && (
                    <td className="max-w-[200px] px-[14px] pt-[13px]">
                      <span className="block truncate">{row.requester?.name ?? '—'}</span>
                      {row.requester?.department && <span className="block truncate text-xs text-ink-500">{row.requester.department}</span>}
                    </td>
                  )}
                  <td className={cell}>{formatDate(row.createdAt)}</td>
                  <td className={cell}>{formatTime(row.createdAt)}</td>
                  <td className={cell}>{pluralize(row.itemCount, 'Item')}</td>
                  <td className={cell}>{row.totalQuantity} Qty</td>
                  <td className={cell}>{row.pickupLocation}</td>
                  <td className={cell}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="pt-[13px] text-right">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(row.id)}
                      aria-label={`${actionLabel} ${row.code}`}
                      className="inline-grid size-7 place-items-center rounded-sm bg-navy text-white transition-colors hover:bg-navy-deep"
                    >
                      <MoreHorizontal className="size-[18px]" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
};
