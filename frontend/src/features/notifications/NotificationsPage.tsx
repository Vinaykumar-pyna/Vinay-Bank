import { useState } from 'react';
import { Button, Card, Form, ListGroup } from 'react-bootstrap';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { PaginationBar } from '@/components/common/PaginationBar';
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@/features/banking/bankingApi';
import { formatDateTime } from '@/lib/format';
import { NOTIFICATION_META } from './notificationMeta';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useGetNotificationsQuery({ page, limit: 20, unreadOnly });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Transaction alerts, security notices and one-time passwords (simulated SMS)."
        actions={
          <Button
            variant="outline-primary"
            onClick={() => void markAll()}
            disabled={markAllState.isLoading}
          >
            <i className="bi bi-check2-all me-1" aria-hidden="true" />
            Mark all read
          </Button>
        }
      />
      <Card>
        <Card.Body>
          <Form.Check
            type="switch"
            id="unread-only"
            label="Show unread only"
            className="mb-3"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(1);
            }}
          />
          {isLoading ? (
            <PageLoader />
          ) : data?.items.length ? (
            <>
              <ListGroup variant="flush">
                {data.items.map((n) => {
                  const meta = NOTIFICATION_META[n.type] ?? NOTIFICATION_META.SYSTEM;
                  return (
                    <ListGroup.Item key={n.id} className="px-0 d-flex gap-3 align-items-start">
                      <span className={`icon-tile icon-tile-${meta.tone}`}>
                        <i className={`bi ${meta.icon}`} aria-hidden="true" />
                      </span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex gap-2 align-items-center">
                          <span className={n.read ? 'fw-medium' : 'fw-bold'}>{n.title}</span>
                          {!n.read && (
                            <span className="badge rounded-pill text-bg-primary">New</span>
                          )}
                        </div>
                        <div className="small text-body-secondary">{n.message}</div>
                        <div className="small text-body-secondary mt-1">
                          {formatDateTime(n.createdAt)}
                        </div>
                      </div>
                      {!n.read && (
                        <Button variant="link" size="sm" onClick={() => void markRead(n.id)}>
                          Mark read
                        </Button>
                      )}
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
              <PaginationBar meta={data.meta} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon="bi-bell-slash" title="No notifications" />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
