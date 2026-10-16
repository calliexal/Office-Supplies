import type { RequestStatus } from '@/api';
import { cn } from '@/lib/cn';

export const STATUS_META: Record<RequestStatus, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'bg-success-soft border-success text-success' },
  pending: { label: 'Pending', className: 'bg-warning-soft border-warning text-warning' },
  rejected: { label: 'Rejected', className: 'bg-danger-soft border-danger text-danger' },
  ready_for_pickup: { label: 'Ready For Pickup', className: 'bg-violet-soft border-violet text-violet' },
  in_delivery: { label: 'On Delivery', className: 'bg-sky border-navy text-navy' },
  finished: { label: 'Finished', className: 'bg-neutral-soft border-ink-700 text-ink-700' },
};

export const StatusBadge = ({ status, className }: { status: RequestStatus; className?: string }) => {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-[106px] items-center justify-center whitespace-nowrap rounded-[20px] border px-4 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
};
