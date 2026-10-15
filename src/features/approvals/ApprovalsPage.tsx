import { CheckCircle2, Inbox, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { REQUEST_STATUSES, type AdminRequestQuery, type AdminRequestSummary, type RequestSort, type RequestStatus } from '@/api';
import { useAdminRequests, useAdminSummary } from '@/api/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { PillSelect } from '@/components/ui/PillSelect';
import { SearchBar } from '@/components/ui/SearchBar';
import { AdminStatCards } from '@/features/dashboard/StatCards';
import { RequestDetailDialog } from '@/features/requests/RequestDetailDialog';
import { RequestsTable } from '@/features/requests/RequestsTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';
import { ReviewActions } from './ReviewActions';

const PAGE_SIZE = 10;
const NOTICE_MS = 6_000;

type Tab = RequestStatus | 'all';
const TABS: Array<{ value: Tab; label: string; count?: keyof AdminRequestSummary }> = [
  { value: 'pending', label: 'Waiting Review', count: 'pending' },
  { value: 'approved', label: 'To Prepare', count: 'approved' },
  { value: 'ready_for_pickup', label: 'Ready For Pickup', count: 'readyForPickup' },
  { value: 'finished', label: 'Finished', count: 'finished' },
  { value: 'rejected', label: 'Rejected', count: 'rejected' },
  { value: 'all', label: 'All', count: 'total' },
];

const SORT_OPTIONS: Array<{ value: RequestSort; label: string }> = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
];

const EMPTY_COPY: Record<Tab, string> = {
  pending: 'All caught up — no requests are waiting for review.',
  approved: 'No approved requests to prepare.',
  ready_for_pickup: 'Nothing is waiting to be picked up.',
  finished: 'No finished requests yet.',
  rejected: 'No rejected requests.',
  all: 'No requests have been submitted yet.',
};

const isTab = (value: string | null): value is Tab => value === 'all' || REQUEST_STATUSES.includes(value as RequestStatus);
const isSort = (value: string | null): value is RequestSort => value === 'oldest' || value === 'newest';

export const ApprovalsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get('status')) ? (params.get('status') as Tab) : 'pending';
  const defaultSort: RequestSort = tab === 'pending' || tab === 'approved' || tab === 'ready_for_pickup' ? 'oldest' : 'newest';
  const sort: RequestSort = isSort(params.get('sort')) ? (params.get('sort') as RequestSort) : defaultSort;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [reviewId, setReviewId] = useState<string | null>(null);
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

  const query = useMemo<AdminRequestQuery>(
    () => ({ search: debouncedSearch || undefined, status: tab === 'all' ? undefined : tab, sort, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, tab, sort, page],
  );

  const summary = useAdminSummary();
  const requests = useAdminRequests(query);

  const linkedReview = params.get('review');
  useEffect(() => {
    if (!linkedReview) return;
    setReviewId(linkedReview);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('review');
        return next;
      },
      { replace: true },
    );
  }, [linkedReview, setParams]);

  const handleDone = useCallback((message: string) => {
    setReviewId(null);
    setNotice(message);
  }, []);

  return (
    <>
      <PageHeader title="Approvals" />

      <div className="mt-6 lg:mt-[38px]">
        {summary.isError ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : <AdminStatCards summary={summary.data} />}
      </div>

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

      <div className="mt-[30px]">
        <SearchBar
          label="Search by request ID, item or employee name"
          value={search}
          onChange={(value) => {
            setSearch(value);
            updateParams({ q: value.trim() || null });
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {TABS.map(({ value, label, count }) => {
            const active = value === tab;
            const n = count && summary.data ? summary.data[count] : null;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => updateParams({ status: value === 'pending' ? null : value, sort: null })}
                className={cn(
                  'inline-flex h-[38px] items-center gap-2 rounded-[18px] px-4 font-display text-sm font-semibold transition-colors',
                  active ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-white/70',
                )}
              >
                {label}
                {n !== null && (
                  <span
                    className={cn(
                      'grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs',
                      active ? 'bg-white text-navy' : value === 'pending' && n > 0 ? 'bg-danger text-white' : 'bg-sky text-navy',
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <PillSelect label="Sort by date" value={sort} options={SORT_OPTIONS} onChange={(value) => updateParams({ sort: value === defaultSort ? null : value })} />
      </div>

      <section aria-labelledby="queue-title" className="mt-4 rounded-[10px] bg-white px-4 pb-10 pt-[29px] sm:px-[33px]">
        <h2 id="queue-title" className="mb-10 font-display text-xl font-semibold text-navy sm:text-2xl">
          {TABS.find((t) => t.value === tab)?.label ?? 'Requests'}
        </h2>
        {requests.isError && !requests.data ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : (
          <>
            <RequestsTable
              caption="Office supply requests from all employees"
              rows={requests.data?.data}
              isLoading={requests.isPending}
              skeletonRows={PAGE_SIZE}
              onOpenDetail={setReviewId}
              showRequester
              actionLabel="Review"
              emptyState={
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Inbox className="size-8 text-ink-400" aria-hidden />
                  <p className="text-sm text-ink-500">{debouncedSearch ? 'No requests match this search.' : EMPTY_COPY[tab]}</p>
                  {debouncedSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        updateParams({ q: null });
                      }}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              }
            />
            {requests.data && <Pagination meta={requests.data.meta} onPageChange={(next) => updateParams({ page: String(next) }, false)} />}
          </>
        )}
      </section>

      <RequestDetailDialog
        requestId={reviewId}
        onClose={() => setReviewId(null)}
        showRequester
        busy={busy}
        renderActions={(detail) => <ReviewActions key={detail.id} detail={detail} onDone={handleDone} onBusyChange={setBusy} />}
      />
    </>
  );
};
