import { useState } from 'react';
import { Button, Dropdown, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/features/banking/bankingApi';
import { isStaffRole } from '@/features/auth/types';
import { formatRelative } from '@/lib/format';
import { NOTIFICATION_META } from './notificationMeta';
import { useRealtimeNotifications } from './useRealtimeNotifications';

export function NotificationBell() {
  useRealtimeNotifications();
  const role = useAppSelector((state) => state.auth.user?.role);
  const base = isStaffRole(role) ? '/staff' : '/app';
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: count } = useGetUnreadCountQuery(undefined, { pollingInterval: 120_000 });
  const { data, isFetching } = useGetNotificationsQuery({ page: 1, limit: 8 }, { skip: !open });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll] = useMarkAllNotificationsReadMutation();
  const unread = count?.unread ?? 0;

  return (
    <Dropdown align="end" show={open} onToggle={setOpen}>
      <Dropdown.Toggle
        as={Button}
        variant="link"
        className="position-relative text-body-secondary p-2 lh-1 border-0"
        aria-label={`Notifications, ${unread} unread`}
        bsPrefix="no-caret"
      >
        <i className="bi bi-bell fs-5" aria-hidden="true" />
        {unread > 0 && <span className="notification-dot">{unread > 99 ? '99+' : unread}</span>}
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow border-0 p-0" style={{ width: 360, maxWidth: '92vw' }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <span className="fw-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="link" size="sm" className="p-0" onClick={() => void markAll()}>
              Mark all read
            </Button>
          )}
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {isFetching && !data ? (
            <div className="text-center py-4">
              <Spinner size="sm" animation="border" />
            </div>
          ) : data?.items.length ? (
            data.items.map((n) => {
              const meta = NOTIFICATION_META[n.type] ?? NOTIFICATION_META.SYSTEM;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`dropdown-item d-flex gap-2 py-2 text-wrap ${n.read ? '' : 'bg-primary-subtle bg-opacity-25'}`}
                  onClick={() => {
                    if (!n.read) void markRead(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link.replace(/^\/app/, base));
                  }}
                >
                  <i className={`bi ${meta.icon} text-${meta.tone} mt-1`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="d-block small fw-semibold">{n.title}</span>
                    <span className="d-block small text-body-secondary">{n.message}</span>
                    <span className="d-block small text-body-secondary">
                      {formatRelative(n.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="text-center text-body-secondary small py-4">You're all caught up.</div>
          )}
        </div>
        <div className="border-top text-center py-2">
          <Link to={`${base}/notifications`} className="small" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
