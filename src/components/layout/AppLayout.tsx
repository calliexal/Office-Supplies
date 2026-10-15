import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useLiveNotifications } from '@/api/queries';
import { Dialog } from '@/components/ui/Dialog';
import { Logo } from './Logo';
import { LogoutDialog } from './LogoutDialog';
import { SidebarNav } from './Sidebar';

export const AppLayout = () => {
  const [isLogoutOpen, setLogoutOpen] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useLiveNotifications();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const openLogout = () => {
    setDrawerOpen(false);
    setLogoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-sky">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] bg-white shadow-sidebar lg:block">
        <SidebarNav onLogout={openLogout} />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-white px-4 shadow-sidebar lg:hidden">
        <Logo size="sm" />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="grid size-11 place-items-center rounded-lg text-navy hover:bg-sky"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </header>

      <Dialog
        open={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        className="ml-0 mt-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] rounded-none rounded-r-xl"
      >
        {({ labelId }) => (
          <div className="relative h-full">
            <h2 id={labelId} className="sr-only">
              Menu
            </h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-navy hover:bg-sky"
            >
              <X className="size-5" aria-hidden />
            </button>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} onLogout={openLogout} />
          </div>
        )}
      </Dialog>

      <main id="main" className="px-4 pb-10 pt-6 sm:px-6 lg:ml-[248px] lg:px-[22px] lg:pt-[57px] xl:pl-[22px] xl:pr-[39px]">
        <div className="mx-auto max-w-[1130px]">
          <Outlet />
        </div>
      </main>

      <LogoutDialog open={isLogoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
};
