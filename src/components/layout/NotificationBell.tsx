import { Bell, CheckCircle2, Inbox, Truck, XCircle, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppNotification, NotificationKind } from '@/api';
import { useMarkNotificationsRead, useNotifications } from '@/api/queries';
import { useIsAdmin } from '@/auth/RequireAuth';
import { Popover } from '@/components/ui/Popover';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

const KIND_STYLE: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  request_submitted: { icon: Inbox, tone: 'bg-brand-soft text-brand' },
  request_approved: { icon: CheckCircle2, tone: 'bg-success-soft text-success' },
  request_rejected: { icon: XCircle, tone: 'bg-danger-soft text-danger' },
  request_ready: { icon: Truck, tone: 'bg-violet-soft text-violet' },
};

const destinationFor = (notification: AppNotification, isAdmin: boolean) => {
  if (!notification.requestId) return null;
  const id = encodeURIComponent(notification.requestId);
  return notification.kind === 'request_submitted' && isAdmin ? `/approvals?status=all&review=${id}` : `/history?request=${id}`;
};

export const NotificationBell = () => {
  const feed = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const unread = feed.data?.unread ?? 0;
  const items = feed.data?.data ?? [];

  const open = (notification: AppNotification, close: () => void) => {
    if (notification.readAt === null) markRead.mutate([notification.id]);
    const target = destinationFor(notification, isAdmin);
    close();
    if (target) navigate(target);
  };

  return (
    <Popover
      label="Notifications"
      width="w-[min(380px,calc(100vw-32px))]"
      className="p-0"
      trigger={({ open: isOpen, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={id}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative grid size-[46px] place-items-center rounded-lg bg-white text-navy shadow-icon transition-colors hover:bg-sky"
        >
          <Bell className="size-6" strokeWidth={1.75} aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-bold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-ink-400/30 px-4 py-3">
            <h2 className="font-display text-base font-bold text-navy">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {feed.isPending && (
              <div className="space-y-3 p-4" aria-busy>
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}
            {feed.isError && !feed.data && (
              <p className="p-4 text-sm text-ink-500">
                Couldn't load notifications.{' '}
                <button type="button" onClick={() => void feed.refetch()} className="font-semibold text-brand hover:underline">
                  Try again
                </button>
              </p>
            )}
            {feed.data && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="size-7 text-ink-400" aria-hidden />
                <p className="text-sm text-ink-500">
                  {isAdmin ? 'New requests from employees will show up here.' : "You'll be notified here when General Affair reviews your requests."}
                </p>
              </div>
            )}
            {items.length > 0 && (
              <ul>
                {items.map((notification) => {
                  const { icon: Icon, tone } = KIND_STYLE[notification.kind];
                  const isUnread = notification.readAt === null;
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => open(notification, close)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sky focus-visible:bg-sky focus-visible:outline-none',
                          isUnread && 'bg-brand-soft/40',
                        )}
                      >
                        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tone)} aria-hidden>
                          <Icon className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm text-ink', isUnread ? 'font-bold' : 'font-medium')}>{notification.title}</span>
                          <span className="mt-0.5 block break-words text-xs text-ink-600">{notification.body}</span>
                          <time dateTime={notification.createdAt} className="mt-1 block text-[11px] text-ink-400">
                            {formatRelative(notification.createdAt)}
                          </time>
                        </span>
                        {isUnread && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
};
