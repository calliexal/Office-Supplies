import { PackageSearch } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isApiError, toUserMessage, type RequestDetail, type Supply, type SupplySort } from '@/api';
import { useCreateRequest, useSupplies } from '@/api/queries';
import { figmaAssets } from '@/assets/figma';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBar } from '@/components/ui/SearchBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { pluralize } from '@/lib/format';
import { cartReducer, cartTotals, initialCart, quantityInCart, remainingFor } from './cart';
import { ProductCard } from './ProductCard';
import { RequestSummaryCard } from './RequestSummaryCard';
import { SubmitSuccessDialog } from './SubmitSuccessDialog';

const PAGE_SIZE = 24;

const ProductGridSkeleton = () => (
  <>
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="h-[245px] rounded-[10px] bg-white p-3">
        <Skeleton className="h-[110px] w-full" />
        <Skeleton className="mt-4 h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/3" />
        <Skeleton className="mt-8 h-8 w-full" />
      </div>
    ))}
  </>
);

export const SuppliesPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SupplySort>('name_asc');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  useEffect(() => setPage(1), [debouncedSearch, sort, inStockOnly]);

  const supplies = useSupplies({ search: debouncedSearch, sort, inStockOnly, page, pageSize: PAGE_SIZE });
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  const totals = cartTotals(cart);

  useEffect(() => {
    if (supplies.data) dispatch({ type: 'syncStock', supplies: supplies.data.data });
  }, [supplies.data]);

  const onDraftChange = useCallback((supply: Supply, value: number) => dispatch({ type: 'setDraft', supply, value }), []);
  const onDraftStep = useCallback((supply: Supply, delta: 1 | -1) => dispatch({ type: 'stepDraft', supply, delta }), []);
  const onAdd = useCallback((supply: Supply) => dispatch({ type: 'add', supply }), []);

  const createRequest = useCreateRequest();
  const idempotencyKey = useRef<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<RequestDetail | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    idempotencyKey.current = null;
  }, [cart.lines, note]);

  const openConfirm = () => {
    idempotencyKey.current ??= crypto.randomUUID();
    createRequest.reset();
    setConfirmOpen(true);
  };

  const submit = () => {
    if (!idempotencyKey.current || cart.lines.length === 0) return;
    createRequest.mutate(
      {
        idempotencyKey: idempotencyKey.current,
        items: cart.lines.map(({ supplyId, quantity }) => ({ supplyId, quantity })),
        note: note.trim() || undefined,
      },
      {
        onSuccess: (request) => {
          idempotencyKey.current = null;
          dispatch({ type: 'clear' });
          setNote('');
          setConfirmOpen(false);
          setCreated(request);
        },
        onError: (error) => {
          if (isApiError(error) && [409, 422].includes(error.status)) {
            idempotencyKey.current = null;
          }
        },
      },
    );
  };

  const hasActiveFilters = sort !== 'name_asc' || inStockOnly;
  const rows = supplies.data?.data;

  return (
    <>
      <PageHeader title="Supplies Requests" />

      <div className="mt-[23px] grid gap-4 lg:grid-cols-[minmax(0,1fr)_268px] lg:gap-[16px] xl:-mr-4">
        <div className="min-w-0">
          <SearchBar
            label="Search supplies"
            value={search}
            onChange={setSearch}
            hasActiveFilters={hasActiveFilters}
            filterContent={
              <fieldset className="space-y-4">
                <legend className="font-display text-sm font-bold text-black">Filter supplies</legend>
                <label className="block text-sm text-ink-600">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SupplySort)}
                    className="mt-1 block h-10 w-full rounded-md border border-ink-400 bg-white px-2 text-sm text-ink"
                  >
                    <option value="name_asc">Name (A–Z)</option>
                    <option value="stock_desc">Most stock</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(event) => setInStockOnly(event.target.checked)}
                    className="size-4 rounded-sm accent-navy"
                  />
                  Hide out-of-stock items
                </label>
              </fieldset>
            }
          />

          <div className="mt-[22px]" aria-busy={supplies.isFetching}>
            {supplies.isError && !rows ? (
              <div className="rounded-[10px] bg-white">
                <ErrorState error={supplies.error} onRetry={() => void supplies.refetch()} />
              </div>
            ) : rows?.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[10px] bg-white px-4 py-14 text-center">
                <PackageSearch className="size-9 text-ink-400" aria-hidden />
                <p className="text-sm text-ink-500">
                  {debouncedSearch ? `No supplies match "${debouncedSearch}".` : 'No supplies match these filters.'}
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand hover:underline"
                  onClick={() => {
                    setSearch('');
                    setSort('name_asc');
                    setInStockOnly(false);
                  }}
                >
                  Clear search and filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-[10px]">
                {rows
                  ? rows.map((supply) => (
                      <ProductCard
                        key={supply.id}
                        supply={supply}
                        draft={cart.drafts[supply.id] ?? 0}
                        remaining={remainingFor(cart, supply)}
                        inCart={quantityInCart(cart, supply.id)}
                        onDraftChange={onDraftChange}
                        onDraftStep={onDraftStep}
                        onAdd={onAdd}
                      />
                    ))
                  : <ProductGridSkeleton />}
              </div>
            )}
            {supplies.data && <Pagination meta={supplies.data.meta} onPageChange={setPage} />}
          </div>
        </div>

        <aside id="request-summary" className="scroll-mt-20 lg:pt-[78px]">
          <div className="lg:sticky lg:top-6">
            <RequestSummaryCard
              lines={cart.lines}
              totalQuantity={totals.totalQuantity}
              note={note}
              onNoteChange={setNote}
              onRemove={(supplyId) => dispatch({ type: 'remove', supplyId })}
              onSubmit={openConfirm}
            />
          </div>
        </aside>
      </div>

      {cart.lines.length > 0 && (
        <>
          <div aria-hidden className="h-20 lg:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.12)] lg:hidden">
            <a href="#request-summary" className="min-w-0 text-sm text-ink-500">
              <span className="font-semibold text-black">{pluralize(totals.itemCount, 'item')}</span> · {totals.totalQuantity} qty
              <span className="block text-xs text-navy underline">Review summary</span>
            </a>
            <button
              type="button"
              onClick={openConfirm}
              className="h-[43px] shrink-0 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-[#dd6533]"
            >
              Submit Requests
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={isConfirmOpen}
        tone="brand"
        icon={<img src={figmaAssets.iconConfirmFile} alt="" width={55} height={55} />}
        title="Confirm Submission"
        description="Please confirm your office supply request."
        confirmLabel="Submit Requests"
        loading={createRequest.isPending}
        error={createRequest.isError ? toUserMessage(createRequest.error) : null}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submit}
      />

      <SubmitSuccessDialog
        request={created}
        onClose={() => setCreated(null)}
        onBackToDashboard={() => {
          setCreated(null);
          navigate('/');
        }}
      />
    </>
  );
};
