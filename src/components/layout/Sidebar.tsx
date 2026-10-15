import { ClipboardCheck, Clock, FilePlus2, LayoutGrid, LogOut, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAdminSummary } from '@/api/queries';
import { useIsAdmin } from '@/auth/RequireAuth';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; adminOnly?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/supplies', label: 'Supplies Requests', icon: FilePlus2 },
  { to: '/history', label: 'Requests History', icon: Clock },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck, adminOnly: true },
];

type SidebarNavProps = { onNavigate?: () => void; onLogout: () => void };

export const SidebarNav = ({ onNavigate, onLogout }: SidebarNavProps) => {
  const isAdmin = useIsAdmin();
  const adminSummary = useAdminSummary({ enabled: isAdmin });
  const pending = adminSummary.data?.pending ?? 0;

  return (
    <div className="flex h-full flex-col pb-[52px] pl-[18px] pr-[18px] pt-[38px]">
      <Logo className="mx-auto" />
      <nav aria-label="Main" className="ml-1.5 mt-[46px] w-[212px] max-w-full">
        <ul className="flex flex-col gap-3">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon, end, adminOnly }) => {
            const badge = adminOnly && pending > 0 ? pending : null;
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  aria-label={badge ? `${label}, ${badge} waiting for review` : undefined}
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
