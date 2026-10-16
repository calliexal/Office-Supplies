import { CheckCircle2, Truck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminRequestQuery, RequestSort, RequestStatus } from '@/api';
import { useDeliveries } from '@/api/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBar } from '@/components/ui/SearchBar';
import { PickupAction } from '@/features/requests/DeliveryActions';
import { RequestDetailDialog } from '@/features/requests/RequestDetailDialog';
import { RequestsTable } from '@/features/requests/RequestsTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 10;
const NOTICE_MS = 6_000;

type Tab = 'ready_for_pickup' | 'in_delivery' | 'finished' | 'all';
const TABS: Array<{ value: Tab; label: string; counted?: boolean }> = [
  { value: 'ready_for_pickup', label: 'Ready to Pick Up', counted: true },
  { value: 'in_delivery', label: 'On Delivery', counted: true },
  { value: 'finished', label: 'Delivered' },
  { value: 'all', label: 'All' },
];

const EMPTY_COPY: Record<Tab, string> = {
  ready_for_pickup: 'Nothing to pick up right now. You will be notified when General Affair prepares a request.',
  in_delivery: 'No deliveries on the way.',
  finished: "You haven't delivered any requests yet.",
  all: 'No deliveries yet.',
};

const isTab = (value: string | null): value is Tab => TABS.some((t) => t.value === value);

const COUNT_QUERY = (status: RequestStatus): AdminRequestQuery => ({ status, page: 1, pageSize: 1 });

export const DeliveriesPage = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get('status')) ? (params.get('status') as Tab) : 'ready_for_pickup';
  const sort: RequestSort = tab === 'finished' || tab === 'all' ? 'newest' : 'oldest';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateParams = (patch: Record<string, string | null>, resetPage = true) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries({ ...patch, ...(resetPage ? { page: null } : {}) }).forEach(([key, value]) =>
          value === null || value === '' ? next.delete(key) : next.set(key, value),
        );
        return next;
      },
      { replace: true },
    );

  const linkedReview = params.get('review');
  useEffect(() => {
    if (!linkedReview) return;
    setOpenId(linkedReview);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('review');
        return next;
      },
      { replace: true },
    );
  }, [linkedReview, setParams]);

  const query = useMemo<AdminRequestQuery>(
    () => ({ search: debouncedSearch || undefined, status: tab === 'all' ? undefined : tab, sort, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, tab, sort, page],
  );

  const deliveries = useDeliveries(query);
  const readyCount = useDeliveries(COUNT_QUERY('ready_for_pickup')).data?.meta.total;
  const onTheWayCount = useDeliveries(COUNT_QUERY('in_delivery')).data?.meta.total;
  const counts: Partial<Record<Tab, number | undefined>> = { ready_for_pickup: readyCount, in_delivery: onTheWayCount };

  const handleDone = useCallback((message: string) => {
    setOpenId(null);
    setNotice(message);
  }, []);

  return (
    <>
      <PageHeader title="Deliveries" />

      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <p className="mt-6 flex items-center gap-3 rounded-lg border border-success bg-success-soft px-4 py-3 text-sm font-medium text-ink">
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid size-7 place-items-center rounded hover:bg-white/60">
              <X className="size-4" aria-hidden />
            </button>
          </p>
        )}
      </div>

      <div className="mt-6 lg:mt-[38px]">
        <SearchBar
          label="Search by request ID, item or employee name"
          value={search}
          onChange={(value) => {
            setSearch(value);
            updateParams({ q: value.trim() || null });
          }}
        />
      </div>

      <div role="group" aria-label="Filter by delivery status" className="mt-6 flex flex-wrap gap-2">
        {TABS.map(({ value, label, counted }) => {
          const active = value === tab;
          const n = counted ? counts[value] : undefined;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => updateParams({ status: value === 'ready_for_pickup' ? null : value })}
              className={cn(
                'inline-flex h-[38px] items-center gap-2 rounded-[18px] px-4 font-display text-sm font-semibold transition-colors',
                active ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-white/70',
              )}
            >
              {label}
              {n !== undefined && (
                <span
                  className={cn(
                    'grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs',
                    active ? 'bg-white text-navy' : value === 'ready_for_pickup' && n > 0 ? 'bg-danger text-white' : 'bg-sky text-navy',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section aria-labelledby="deliveries-title" className="mt-4 rounded-[10px] bg-white px-4 pb-10 pt-[29px] sm:px-[33px]">
        <h2 id="deliveries-title" className="mb-10 flex items-center gap-2 font-display text-xl font-semibold text-navy sm:text-2xl">
          <Truck className="size-6" aria-hidden />
          {TABS.find((t) => t.value === tab)?.label}
        </h2>
        {deliveries.isError && !deliveries.data ? (
          <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} />
        ) : (
          <>
            <RequestsTable
              caption="Office supply deliveries"
              rows={deliveries.data?.data}
              isLoading={deliveries.isPending}
              skeletonRows={PAGE_SIZE}
              onOpenDetail={setOpenId}
              showRequester
              actionLabel="Open delivery"
              emptyState={
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Truck className="size-8 text-ink-400" aria-hidden />
                  <p className="max-w-sm text-sm text-ink-500">{debouncedSearch ? 'No deliveries match this search.' : EMPTY_COPY[tab]}</p>
                </div>
              }
            />
            {deliveries.data && <Pagination meta={deliveries.data.meta} onPageChange={(next) => updateParams({ page: String(next) }, false)} />}
          </>
        )}
      </section>

      <RequestDetailDialog
        requestId={openId}
        onClose={() => setOpenId(null)}
        showRequester
        busy={busy}
        renderActions={(detail) => <PickupAction key={detail.id} detail={detail} onDone={handleDone} onBusyChange={setBusy} />}
      />
    </>
  );
};
