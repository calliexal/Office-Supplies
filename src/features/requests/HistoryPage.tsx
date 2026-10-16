import { SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { REQUEST_STATUSES, type RequestQuery, type RequestStatus } from '@/api';
import { useRequestHistory } from '@/api/queries';
import { useIsAdmin } from '@/auth/RequireAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { PillSelect } from '@/components/ui/PillSelect';
import { SearchBar } from '@/components/ui/SearchBar';
import { STATUS_META } from '@/components/ui/StatusBadge';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toDayKey } from '@/lib/format';
import { RequestDetailDialog } from './RequestDetailDialog';
import { RequestsTable } from './RequestsTable';

const PAGE_SIZE = 10;

type DatePreset = 'newest' | 'oldest' | 'last7' | 'last30';
const DATE_OPTIONS: Array<{ value: DatePreset; label: string }> = [
  { value: 'newest', label: 'Date' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
];

type StatusFilter = RequestStatus | 'all';
const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Status' },
  ...REQUEST_STATUSES.map((status) => ({ value: status, label: STATUS_META[status].label })),
];

const isDatePreset = (value: string | null): value is DatePreset => DATE_OPTIONS.some((o) => o.value === value);
const isStatus = (value: string | null): value is RequestStatus => REQUEST_STATUSES.includes(value as RequestStatus);
const isDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

const daysAgo = (days: number) => toDayKey(new Date(Date.now() - days * 86_400_000));

export const HistoryPage = () => {
  const [params, setParams] = useSearchParams();
  const datePreset: DatePreset = isDatePreset(params.get('date')) ? (params.get('date') as DatePreset) : 'newest';
  const status: StatusFilter = isStatus(params.get('status')) ? (params.get('status') as RequestStatus) : 'all';
  const from = isDay(params.get('from')) ? params.get('from') : null;
  const to = isDay(params.get('to')) ? params.get('to') : null;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [detailId, setDetailId] = useState<string | null>(null);

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
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
  };

  const query = useMemo<RequestQuery>(() => {
    const presetFrom = datePreset === 'last7' ? daysAgo(6) : datePreset === 'last30' ? daysAgo(29) : undefined;
    return {
      search: debouncedSearch || undefined,
      status: status === 'all' ? undefined : status,
      sort: datePreset === 'oldest' ? 'oldest' : 'newest',
      dateFrom: from ?? presetFrom,
      dateTo: to ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [debouncedSearch, status, datePreset, from, to, page]);

  const linkedRequest = params.get('request');
  useEffect(() => {
    if (!linkedRequest) return;
    setDetailId(linkedRequest);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('request');
        return next;
      },
      { replace: true },
    );
  }, [linkedRequest, setParams]);

  const isAdmin = useIsAdmin();
  const requests = useRequestHistory(query, isAdmin ? 'everyone' : 'mine');
  const hasFilters = status !== 'all' || datePreset !== 'newest' || !!from || !!to || !!debouncedSearch;

  const clearAll = () => {
    setSearch('');
    setParams({}, { replace: true });
  };

  return (
    <>
      <PageHeader title="Requests History" />

      <div className="mt-[23px]">
        <SearchBar
          label={isAdmin ? 'Search by request ID, item or employee name' : 'Search requests by ID or item'}
          value={search}
          onChange={(value) => {
            setSearch(value);
            updateParams({ q: value.trim() || null });
          }}
          hasActiveFilters={!!from || !!to}
          filterContent={
            <fieldset className="space-y-3">
              <legend className="font-display text-sm font-bold text-black">Custom date range</legend>
              <label className="block text-sm text-ink-600">
                From
                <input
                  type="date"
                  value={from ?? ''}
                  max={to ?? undefined}
                  onChange={(event) => updateParams({ from: event.target.value || null })}
                  className="mt-1 block h-10 w-full rounded-md border border-ink-400 px-2 text-sm"
                />
              </label>
              <label className="block text-sm text-ink-600">
                To
                <input
                  type="date"
                  value={to ?? ''}
                  min={from ?? undefined}
                  onChange={(event) => updateParams({ to: event.target.value || null })}
                  className="mt-1 block h-10 w-full rounded-md border border-ink-400 px-2 text-sm"
                />
              </label>
              {(from || to) && (
                <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => updateParams({ from: null, to: null })}>
                  Clear dates
                </button>
              )}
            </fieldset>
          }
        />
      </div>

      <div className="mt-[34px] flex flex-wrap gap-[15px]">
        <PillSelect label="Filter by date" value={datePreset} options={DATE_OPTIONS} onChange={(value) => updateParams({ date: value === 'newest' ? null : value })} />
        <PillSelect label="Filter by status" value={status} options={STATUS_OPTIONS} onChange={(value) => updateParams({ status: value === 'all' ? null : value })} />
      </div>

      <section aria-labelledby="list-title" className="mt-4 rounded-[10px] bg-white px-4 pb-10 pt-[29px] sm:px-[33px]">
        <h2 id="list-title" className="mb-10 font-display text-xl font-semibold text-navy sm:text-2xl">
          {isAdmin ? 'All Employee Requests' : 'Requests List'}
        </h2>
        {requests.isError && !requests.data ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : (
          <>
            <RequestsTable
              caption={isAdmin ? 'Office supply requests from all employees' : 'All your office supply requests'}
              rows={requests.data?.data}
              isLoading={requests.isPending}
              skeletonRows={PAGE_SIZE}
              onOpenDetail={setDetailId}
              showRequester={isAdmin}
              emptyState={
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <SearchX className="size-8 text-ink-400" aria-hidden />
                  <p className="text-sm text-ink-500">
                    {hasFilters
                      ? 'No requests match these filters.'
                      : isAdmin
                        ? 'No employee has submitted a request yet.'
                        : "You haven't submitted any requests yet."}
                  </p>
                  {hasFilters ? (
                    <button type="button" onClick={clearAll} className="text-sm font-semibold text-brand hover:underline">
                      Clear all filters
                    </button>
                  ) : isAdmin ? null : (
                    <Link to="/supplies" className="text-sm font-semibold text-brand hover:underline">
                      Create a request
                    </Link>
                  )}
                </div>
              }
            />
            {requests.data && <Pagination meta={requests.data.meta} onPageChange={(next) => updateParams({ page: String(next) }, false)} />}
          </>
        )}
      </section>

      <RequestDetailDialog requestId={detailId} onClose={() => setDetailId(null)} showRequester={isAdmin} />
    </>
  );
};
