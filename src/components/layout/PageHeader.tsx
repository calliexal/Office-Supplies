import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { formatHeaderDate } from '@/lib/format';
import { NotificationBell } from './NotificationBell';

const useToday = () => {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
};

export const PageHeader = ({ title }: { title: string }) => {
  const user = useCurrentUser();
  const today = useToday();

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-black sm:text-[32px]">{title}</h1>
        <p className="mt-1 text-base text-ink-500">
          <time dateTime={today.toISOString()}>{formatHeaderDate(today)}</time>
        </p>
      </div>
      <div className="flex items-center gap-4 sm:gap-[17px]">
        <NotificationBell />
        <div className="ml-1 flex min-w-0 items-center gap-4">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-black">{user.name}</p>
            <p className="truncate text-sm font-medium text-ink-500">{user.position}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
