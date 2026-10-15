import { ArrowRight, ClipboardCheck, Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminSummary, useRequests, useRequestSummary } from '@/api/queries';
import { figmaAssets } from '@/assets/figma';
import { useCurrentUser } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { firstNameOf, pluralize } from '@/lib/format';
import { RequestDetailDialog } from '@/features/requests/RequestDetailDialog';
import { RequestsTable } from '@/features/requests/RequestsTable';
import { StatCards } from './StatCards';

const RECENT_QUERY = { sort: 'newest', page: 1, pageSize: 5 } as const;

export const DashboardPage = () => {
  const user = useCurrentUser();
  const summary = useRequestSummary();
  const recent = useRequests(RECENT_QUERY);
  const [detailId, setDetailId] = useState<string | null>(null);
  const isAdmin = user.role === 'admin';
  const adminSummary = useAdminSummary({ enabled: isAdmin });
  const pendingReviews = isAdmin ? (adminSummary.data?.pending ?? 0) : 0;

  return (
    <>
      <PageHeader title="Dashboard" />

      <section className="relative mt-6 overflow-hidden rounded bg-hero px-6 py-8 text-white sm:px-11 sm:py-[30px] lg:mt-[55px] lg:overflow-visible">
        <div className="relative z-10 max-w-[600px]">
          <h2 className="text-[28px] font-semibold leading-tight sm:text-[40px]">Welcome, {firstNameOf(user.name)}!</h2>
          <p className="mt-2 text-base sm:text-lg">Submit your office supply requests and track them in real time.</p>
          <Link
            to="/supplies"
            className="mt-[30px] inline-flex h-[51px] items-center gap-[9px] rounded-[5px] bg-white px-[21px] text-base font-medium text-ink transition-colors hover:bg-sky"
          >
            <Plus className="size-[29px]" strokeWidth={1.5} aria-hidden />
            Supplies Requests
          </Link>
        </div>
        <span className="pointer-events-none absolute bottom-[-8px] right-[35px] hidden h-[298px] w-[218px] overflow-hidden lg:block" aria-hidden>
          <img
            src={figmaAssets.heroIllustration}
            alt=""
            className="absolute left-[-183.05%] top-[-26.8%] h-[165.39%] w-[401.67%] max-w-none"
          />
        </span>
      </section>

      {pendingReviews > 0 && (
        <Link
          to="/approvals"
          className="mt-[38px] flex items-center gap-4 rounded-md border-l-[10px] border-warning bg-white px-5 py-4 shadow-stat transition-colors hover:bg-warning-soft"
        >
          <ClipboardCheck className="size-7 shrink-0 text-warning" aria-hidden />
          <span className="flex-1 font-display text-[15px] font-semibold text-black">
            {pluralize(pendingReviews, 'request is', 'requests are')} waiting for your review
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Review now <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      )}

      <div className="mt-[38px]">
        {summary.isError ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : <StatCards summary={summary.data} />}
      </div>

      <section aria-labelledby="recent-title" className="mt-[37px] rounded-[10px] bg-white px-4 pb-10 pt-[29px] sm:px-[33px]">
        <div className="mb-9 flex items-center justify-between gap-4">
          <h2 id="recent-title" className="font-display text-xl font-semibold text-navy sm:text-2xl">
            Recent Requests
          </h2>
          <Link to="/history" className="inline-flex h-8 items-center rounded-md bg-navy px-[30px] text-base font-medium text-white hover:bg-navy-deep">
            See All
          </Link>
        </div>
        {recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
        ) : (
          <RequestsTable
            caption="Your five most recent requests"
            rows={recent.data?.data}
            isLoading={recent.isPending}
            onOpenDetail={setDetailId}
            emptyState={
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Inbox className="size-8 text-ink-400" aria-hidden />
                <p className="text-sm text-ink-500">You haven't submitted any requests yet.</p>
                <Link to="/supplies" className="text-sm font-semibold text-brand hover:underline">
                  Create your first request
                </Link>
              </div>
            }
          />
        )}
      </section>

      <RequestDetailDialog requestId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
};
