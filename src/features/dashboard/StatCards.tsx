import type { AdminRequestSummary, RequestSummary } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

type Tone = 'brand' | 'danger' | 'warning' | 'success' | 'violet' | 'navy';
type Stat<K extends string> = { key: K; label: string; tone: Tone };

const TONES: Record<Tone, { bg: string; accent: string; text: string }> = {
  brand: { bg: 'bg-brand-soft', accent: 'bg-brand', text: 'text-brand' },
  danger: { bg: 'bg-danger-soft', accent: 'bg-danger', text: 'text-danger' },
  warning: { bg: 'bg-warning-soft', accent: 'bg-warning', text: 'text-warning' },
  success: { bg: 'bg-success-soft', accent: 'bg-success', text: 'text-success' },
  violet: { bg: 'bg-violet-soft', accent: 'bg-violet', text: 'text-violet' },
  navy: { bg: 'bg-sky', accent: 'bg-navy', text: 'text-navy' },
};

const MY_STATS: Array<Stat<keyof RequestSummary>> = [
  { key: 'total', label: 'My Requests', tone: 'brand' },
  { key: 'rejected', label: 'Rejected Requests', tone: 'danger' },
  { key: 'pending', label: 'Pending Requests', tone: 'warning' },
  { key: 'approved', label: 'Approved Requests', tone: 'success' },
];

const ADMIN_STATS: Array<Stat<keyof AdminRequestSummary>> = [
  { key: 'pending', label: 'Waiting Review', tone: 'warning' },
  { key: 'approved', label: 'To Prepare', tone: 'success' },
  { key: 'readyForPickup', label: 'Ready For Pickup', tone: 'violet' },
  { key: 'inDelivery', label: 'On Delivery', tone: 'navy' },
];

const Tiles = <K extends string>({ stats, values }: { stats: Array<Stat<K>>; values: Record<K, number> | undefined }) => (
  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-[33px]">
    {stats.map((stat) => {
      const tone = TONES[stat.tone];
      return (
        <li
          key={stat.key}
          className={cn('relative flex h-[78px] items-center justify-between overflow-hidden rounded-md pl-6 pr-[14px] shadow-stat', tone.bg)}
        >
          <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[10px]', tone.accent)} />
          <span className="max-w-[110px] font-display text-[15px] font-semibold leading-[18px] text-black">{stat.label}</span>
          <span className="grid h-[60px] w-[65px] place-items-center rounded bg-white">
            {values ? <span className={cn('text-4xl font-bold', tone.text)}>{values[stat.key]}</span> : <Skeleton className="h-9 w-8" />}
          </span>
        </li>
      );
    })}
  </ul>
);

export const StatCards = ({ summary }: { summary: RequestSummary | undefined }) => <Tiles stats={MY_STATS} values={summary} />;

export const AdminStatCards = ({ summary }: { summary: AdminRequestSummary | undefined }) => (
  <Tiles stats={ADMIN_STATS} values={summary} />
);
