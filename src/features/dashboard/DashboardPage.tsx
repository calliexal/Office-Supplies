import { ArrowRight, ClipboardCheck, Inbox, Plus, Truck, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AdminRequestQuery, RequestStatus } from '@/api';
import { canConfirmReceived } from '@/api/lifecycle';
import { useAdminSummary, useDeliveries, useRequestHistory, useRequestSummary } from '@/api/queries';
import { figmaAssets } from '@/assets/figma';
import { useCurrentUser } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/cn';
import { firstNameOf, pluralize } from '@/lib/format';
import { ConfirmReceivedAction, PickupAction } from '@/features/requests/DeliveryActions';
import { RequestDetailDialog } from '@/features/requests/RequestDetailDialog';
import { RequestsTable } from '@/features/requests/RequestsTable';
import { AdminStatCards, DeliveryStatCards, StatCards, type DeliverySummary } from './StatCards';

const RECENT_QUERY = { sort: 'newest', page: 1, pageSize: 5 } as const;
const RECENT_DELIVERIES_QUERY: AdminRequestQuery = { sort: 'newest', page: 1, pageSize: 5 };
const countQuery = (status?: RequestStatus): AdminRequestQuery => ({ status, page: 1, pageSize: 1 });
const READY_QUERY = countQuery('ready_for_pickup');
const ON_DELIVERY_QUERY = countQuery('in_delivery');
const DELIVERED_QUERY = countQuery('finished');
const ALL_DELIVERIES_QUERY = countQuery();

type HeroProps = { name: string; subtitle: string; cta: { to: string; label: string; icon: LucideIcon } };

const WelcomeHero = ({ name, subtitle, cta: { to, label, icon: Icon } }: HeroProps) => (
  <section className="relative mt-6 overflow-hidden rounded bg-hero px-6 py-8 text-white sm:px-11 sm:py-[30px] lg:mt-[55px] lg:overflow-visible">
    <div className="relative z-10 max-w-[600px]">
      <h2 className="text-[28px] font-semibold leading-tight sm:text-[40px]">Welcome, {firstNameOf(name)}!</h2>
      <p className="mt-2 text-base sm:text-lg">{subtitle}</p>
      <Link
        to={to}
        className="mt-[30px] inline-flex h-[51px] items-center gap-[9px] rounded-[5px] bg-white px-[21px] text-base font-medium text-ink transition-colors hover:bg-sky"
      >
        <Icon className="size-[29px]" strokeWidth={1.5} aria-hidden />
        {label}
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
);

type CalloutProps = { to: string; icon: LucideIcon; tone: 'warning' | 'navy'; action: string; children: ReactNode };

const CALLOUT_TONES = {
  warning: { box: 'border-warning hover:bg-warning-soft', icon: 'text-warning' },
  navy: { box: 'border-navy hover:bg-sky', icon: 'text-navy' },
};

const Callout = ({ to, icon: Icon, tone, action, children }: CalloutProps) => (
  <Link
    to={to}
    className={cn('mt-[38px] flex items-center gap-4 rounded-md border-l-[10px] bg-white px-5 py-4 shadow-stat transition-colors', CALLOUT_TONES[tone].box)}
  >
    <Icon className={cn('size-7 shrink-0', CALLOUT_TONES[tone].icon)} aria-hidden />
    <span className="flex-1 font-display text-[15px] font-semibold text-black">{children}</span>
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
      {action} <ArrowRight className="size-4" aria-hidden />
    </span>
  </Link>
);

type RecentSectionProps = { title: string; seeAllTo: string; children: ReactNode };

const RecentSection = ({ title, seeAllTo, children }: RecentSectionProps) => (
  <section aria-labelledby="recent-title" className="mt-[37px] rounded-[10px] bg-white px-4 pb-10 pt-[29px] sm:px-[33px]">
    <div className="mb-9 flex items-center justify-between gap-4">
      <h2 id="recent-title" className="font-display text-xl font-semibold text-navy sm:text-2xl">
        {title}
      </h2>
      <Link to={seeAllTo} className="inline-flex h-8 items-center rounded-md bg-navy px-[30px] text-base font-medium text-white hover:bg-navy-deep">
        See All
      </Link>
    </div>
    {children}
  </section>
);

const LogisticsDashboard = ({ name }: { name: string }) => {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = useDeliveries(RECENT_DELIVERIES_QUERY);
  const ready = useDeliveries(READY_QUERY);
  const onDelivery = useDeliveries(ON_DELIVERY_QUERY);
  const delivered = useDeliveries(DELIVERED_QUERY);
  const all = useDeliveries(ALL_DELIVERIES_QUERY);

  const counts = [ready, onDelivery, delivered, all].map((q) => q.data?.meta.total);
  const [readyCount, onDeliveryCount, deliveredCount, allCount] = counts;
  const summary: DeliverySummary | undefined = counts.every((n) => n !== undefined)
    ? { ready: readyCount ?? 0, onDelivery: onDeliveryCount ?? 0, delivered: deliveredCount ?? 0, all: allCount ?? 0 }
    : undefined;
  const countError = [ready, onDelivery, delivered, all].find((q) => q.isError);

  return (
    <>
      <PageHeader title="Dashboard" />

      <WelcomeHero
        name={name}
        subtitle="Pick up prepared supplies at General Affair and deliver them to employees."
        cta={{ to: '/deliveries', label: 'Open Deliveries', icon: Truck }}
      />

      {(readyCount ?? 0) > 0 && (
        <Callout to="/deliveries" icon={Truck} tone="navy" action="Open deliveries">
          {pluralize(readyCount ?? 0, 'request is', 'requests are')} ready to pick up at General Affair
        </Callout>
      )}

      <div className="mt-[38px]">
        {countError ? (
          <ErrorState error={countError.error} onRetry={() => void countError.refetch()} />
        ) : (
          <DeliveryStatCards summary={summary} />
        )}
      </div>

      <RecentSection title="Recent Deliveries" seeAllTo="/deliveries?status=all">
        {recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
        ) : (
          <RequestsTable
            caption="The five most recent deliveries"
            rows={recent.data?.data}
            isLoading={recent.isPending}
            onOpenDetail={setDetailId}
            showRequester
            actionLabel="Open delivery"
            emptyState={
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Truck className="size-8 text-ink-400" aria-hidden />
                <p className="text-sm text-ink-500">No deliveries yet. You will be notified when General Affair prepares a request.</p>
              </div>
            }
          />
        )}
      </RecentSection>

      <RequestDetailDialog
        requestId={detailId}
        onClose={() => setDetailId(null)}
        showRequester
        busy={busy}
        renderActions={(detail) => (
          <PickupAction key={detail.id} detail={detail} onDone={() => setDetailId(null)} onBusyChange={setBusy} />
        )}
      />
    </>
  );
};

const RequesterDashboard = ({ name, isAdmin }: { name: string; isAdmin: boolean }) => {
  const summary = useRequestSummary();
  const recent = useRequestHistory(RECENT_QUERY, isAdmin ? 'everyone' : 'mine');
  const [detailId, setDetailId] = useState<string | null>(null);
  const adminSummary = useAdminSummary({ enabled: isAdmin });
  const pendingReviews = isAdmin ? (adminSummary.data?.pending ?? 0) : 0;

  return (
    <>
      <PageHeader title="Dashboard" />

      <WelcomeHero
        name={name}
        subtitle="Submit your office supply requests and track them in real time."
        cta={{ to: '/supplies', label: 'Supplies Requests', icon: Plus }}
      />

      {pendingReviews > 0 && (
        <Callout to="/approvals" icon={ClipboardCheck} tone="warning" action="Review now">
          {pluralize(pendingReviews, 'request is', 'requests are')} waiting for your review
        </Callout>
      )}

      <div className="mt-[38px]">
        {isAdmin ? (
          adminSummary.isError ? (
            <ErrorState error={adminSummary.error} onRetry={() => void adminSummary.refetch()} />
          ) : (
            <AdminStatCards summary={adminSummary.data} />
          )
        ) : summary.isError ? (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        ) : (
          <StatCards summary={summary.data} />
        )}
      </div>

      <RecentSection title="Recent Requests" seeAllTo="/history">
        {recent.isError ? (
          <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
        ) : (
          <RequestsTable
            caption={isAdmin ? 'The five most recent requests from all employees' : 'Your five most recent requests'}
            rows={recent.data?.data}
            isLoading={recent.isPending}
            onOpenDetail={setDetailId}
            showRequester={isAdmin}
            emptyState={
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Inbox className="size-8 text-ink-400" aria-hidden />
                <p className="text-sm text-ink-500">
                  {isAdmin ? 'No employee has submitted a request yet.' : "You haven't submitted any requests yet."}
                </p>
                {!isAdmin && (
                  <Link to="/supplies" className="text-sm font-semibold text-brand hover:underline">
                    Create your first request
                  </Link>
                )}
              </div>
            }
          />
        )}
      </RecentSection>

      <RequestDetailDialog
        requestId={detailId}
        onClose={() => setDetailId(null)}
        showRequester={isAdmin}
        renderActions={
          isAdmin
            ? undefined
            : (detail) =>
                canConfirmReceived(detail.status) ? (
                  <ConfirmReceivedAction key={detail.id} detail={detail} onDone={() => setDetailId(null)} />
                ) : null
        }
      />
    </>
  );
};

export const DashboardPage = () => {
  const user = useCurrentUser();
  if (user.role === 'logistics') return <LogisticsDashboard name={user.name} />;
  return <RequesterDashboard name={user.name} isAdmin={user.role === 'admin'} />;
};
