import { ClipboardCheck, Clock, FilePlus2, LayoutGrid, LogOut, Truck, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { UserRole } from '@/api';
import { useAdminSummary, useDeliveries } from '@/api/queries';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  onlyFor?: UserRole;
  hiddenFor?: UserRole;
  badgeLabel?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/supplies', label: 'Supplies Requests', icon: FilePlus2, hiddenFor: 'logistics' },
  { to: '/history', label: 'Requests History', icon: Clock, hiddenFor: 'logistics' },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck, onlyFor: 'admin', badgeLabel: 'waiting for review' },
  { to: '/deliveries', label: 'Deliveries', icon: Truck, onlyFor: 'logistics', badgeLabel: 'ready to pick up' },
];

const READY_QUERY = { status: 'ready_for_pickup', page: 1, pageSize: 1 } as const;

type SidebarNavProps = { onNavigate?: () => void; onLogout: () => void };

export const SidebarNav = ({ onNavigate, onLogout }: SidebarNavProps) => {
  const auth = useAuth();
  const role = auth.status === 'authenticated' ? auth.user.role : null;
  const adminSummary = useAdminSummary({ enabled: role === 'admin' });
  const readyDeliveries = useDeliveries(READY_QUERY, { enabled: role === 'logistics' });
  const badges: Partial<Record<UserRole, number>> = {
    admin: adminSummary.data?.pending ?? 0,
    logistics: readyDeliveries.data?.meta.total ?? 0,
  };

  return (
    <div className="flex h-full flex-col pb-[52px] pl-[18px] pr-[18px] pt-[38px]">
      <Logo className="mx-auto" />
      <nav aria-label="Main" className="ml-1.5 mt-[46px] w-[212px] max-w-full">
        <ul className="flex flex-col gap-3">
          {NAV_ITEMS.filter((item) => (!item.onlyFor || item.onlyFor === role) && item.hiddenFor !== role).map(({ to, label, icon: Icon, end, onlyFor, badgeLabel }) => {
            const count = onlyFor ? (badges[onlyFor] ?? 0) : 0;
            const badge = count > 0 ? count : null;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  aria-label={badge ? `${label}, ${badge} ${badgeLabel ?? ''}`.trim() : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex h-[51px] items-center gap-[15px] whitespace-nowrap rounded-xl px-4 text-sm transition-colors',
                      isActive ? 'bg-brand font-bold text-white' : 'font-medium text-navy hover:bg-sky',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="size-7 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="flex-1">{label}</span>
                      {badge !== null && (
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold',
                            isActive ? 'bg-white text-brand' : 'bg-danger text-white',
                          )}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="mt-auto flex h-[51px] w-[212px] max-w-full items-center gap-4 rounded-xl px-[42px] text-sm font-bold text-danger transition-colors hover:bg-danger hover:text-white"
      >
        <LogOut className="size-7 -scale-x-100" strokeWidth={1.75} aria-hidden />
        Log Out
      </button>
    </div>
  );
};
