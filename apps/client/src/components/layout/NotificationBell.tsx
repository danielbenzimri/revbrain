import { Bell, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useNotificationCount,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from '@/features/admin/hooks';
import type { AdminNotification } from '@/features/admin/hooks';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function SeverityIcon({ severity }: { severity: AdminNotification['severity'] }) {
  switch (severity) {
    case 'critical':
      return <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />;
    case 'info':
    default:
      return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: AdminNotification;
  onMarkRead: (id: string) => void;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors rounded-md',
        !notification.isRead && 'bg-blue-50/50'
      )}
      onClick={() => {
        if (!notification.isRead) {
          onMarkRead(notification.id);
        }
      }}
    >
      <SeverityIcon severity={notification.severity} />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm truncate',
            !notification.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{notification.message}</p>
        <p className="text-xs text-slate-400 mt-1">{timeAgo(notification.createdAt)}</p>
      </div>
      {!notification.isRead && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
    </button>
  );
}

export function NotificationBell() {
  const { t } = useTranslation('admin');
  const { data: unreadCount = 0 } = useNotificationCount();
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const handleMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-700">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-hidden flex flex-col">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('notifications.title')}</span>
          {unreadCount > 0 && (
            <span className="text-xs font-normal text-slate-500">
              {unreadCount} {t('notifications.unread')}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="overflow-y-auto flex-1 max-h-[320px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {t('notifications.noNotifications')}
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={handleMarkRead}
              />
            ))
          )}
        </div>
        {notifications.length > 0 && unreadCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors rounded-b-lg"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
            >
              <Check className="h-3.5 w-3.5" />
              {t('notifications.markAllRead')}
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
