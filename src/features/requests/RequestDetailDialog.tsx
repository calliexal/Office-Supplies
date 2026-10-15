import type { ReactNode } from 'react';
import type { RequestDetail } from '@/api';
import { useRequestDetail } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatTime } from '@/lib/format';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-6 first:mt-0">
    <h3 className="font-display text-base font-bold text-ink-500">{title}</h3>
    <hr className="mb-4 mt-2 border-t-2 border-dashed border-navy" aria-hidden />
    {children}
  </section>
);

const Row = ({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-start justify-between gap-4 py-1">
    <dt className={strong ? 'font-display text-base font-medium text-black' : 'font-display text-base font-medium text-ink-500'}>
      {label}
    </dt>
    <dd className="text-right text-sm font-medium text-navy">{value}</dd>
  </div>
);

type RequestDetailDialogProps = {
  requestId: string | null;
  onClose: () => void;
  showRequester?: boolean;
  renderActions?: (detail: RequestDetail) => ReactNode;
  busy?: boolean;
};

export const RequestDetailDialog = ({ requestId, onClose, showRequester = false, renderActions, busy = false }: RequestDetailDialogProps) => {
  const { data, isPending, isError, error, refetch } = useRequestDetail(requestId);

  return (
    <Dialog open={requestId !== null} onClose={onClose} dismissible={!busy} className="max-w-[851px] rounded-2xl">
      {({ labelId, descriptionId }) => (
        <div className="px-4 pb-4 pt-8 sm:px-[17px] sm:pt-[55px]">
          <div className="flex items-center justify-between gap-4 px-2 sm:px-3">
            <h2 id={labelId} className="font-display text-xl font-bold text-black sm:text-2xl">
              Requests Detail
            </h2>
            {data && <StatusBadge status={data.status} />}
          </div>
          <p id={descriptionId} className="sr-only">
            {data ? `Details for request ${data.code}` : 'Loading request details'}
          </p>

          <div className="mt-6 rounded-2xl bg-sky px-4 pb-8 pt-7 sm:px-[21px]">
            {isPending && (
              <div className="space-y-3" aria-busy>
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            )}
            {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
            {data && (
              <>
                <Section title="Requests Information">
                  <dl>
                    <Row label="Request ID" value={data.code} />
                    {showRequester && (
                      <Row
                        label="Requested By"
                        value={data.requester.department ? `${data.requester.name} · ${data.requester.department}` : data.requester.name}
                      />
                    )}
                    <Row label="Request Date" value={formatDate(data.createdAt)} />
                    <Row label="Request Time" value={formatTime(data.createdAt)} />
                    <Row label="Pick Up Location" value={data.pickupLocation} />
                    {data.reviewedAt && (
                      <Row label="Last Updated" value={`${formatDate(data.reviewedAt)}, ${formatTime(data.reviewedAt)}`} />
                    )}
                    {data.reviewedBy && <Row label="Reviewed By" value={data.reviewedBy} />}
                    {data.rejectionReason && (
                      <Row label="Rejection Reason" value={<span className="whitespace-pre-line break-words">{data.rejectionReason}</span>} />
                    )}
                  </dl>
                </Section>
                <Section title="Requested Item">
                  <div className="flex justify-between font-display text-[13px] font-medium text-ink-500">
                    <span>Items</span>
                    <span>Qty</span>
                  </div>
                  <ul className="mt-1">
                    {data.items.map((item) => (
                      <li key={item.supplyId} className="flex justify-between gap-4 py-1">
                        <span className="font-display text-base font-medium text-black">{item.name}</span>
                        <span className="text-sm font-medium text-navy">x{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Summary">
                  <dl>
                    <Row strong label="Total Items" value={data.itemCount} />
                    <Row strong label="Total Quantity" value={data.totalQuantity} />
                  </dl>
                </Section>
              </>
            )}
            {data && renderActions?.(data)}
            <div className="mt-10 flex justify-center">
              <Button variant={renderActions ? 'outline' : 'danger'} className="w-full max-w-[197px]" onClick={onClose} disabled={busy}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};
