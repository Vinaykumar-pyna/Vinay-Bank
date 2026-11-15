import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { baseApi } from '@/api/baseApi';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { store } from '@/app/store';
import type { AppNotification } from '@/features/banking/types';
import { env } from '@/config/env';
import { refreshAccessToken } from '@/lib/session';
import { NOTIFICATION_META } from './notificationMeta';

type InvalidatableTag = 'Notification' | 'Account' | 'Transaction' | 'Approval' | 'Beneficiary';

const TAGS_BY_TYPE: Record<string, InvalidatableTag[]> = {
  TRANSACTION: ['Notification', 'Account', 'Transaction'],
  ACCOUNT: ['Notification', 'Account'],
  APPROVAL: ['Notification', 'Approval', 'Transaction', 'Account'],
};

/**
 * Live notifications over Socket.IO. Connects once per sign-in; the auth
 * callback reads the latest access token on every (re)connection, so silent
 * token refreshes are picked up automatically. Each event shows a toast and
 * invalidates the affected RTK Query caches, so balances update instantly.
 */
export function useRealtimeNotifications(): void {
  const signedIn = useAppSelector((state) => state.auth.status === 'authenticated');
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!signedIn) return;
    const socket = io(env.socketUrl || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: store.getState().auth.accessToken }),
    });

    socket.on('notification', (notification: AppNotification) => {
      const meta = NOTIFICATION_META[notification.type] ?? NOTIFICATION_META.SYSTEM;
      toast(
        () => (
          <div className="d-flex gap-2">
            <i className={`bi ${meta.icon} text-${meta.tone} fs-5`} aria-hidden="true" />
            <div>
              <div className="fw-semibold small">{notification.title}</div>
              <div className="small text-body-secondary">{notification.message}</div>
            </div>
          </div>
        ),
        { duration: notification.type === 'OTP' ? 20_000 : 6_000, id: notification.id },
      );
      dispatch(baseApi.util.invalidateTags(TAGS_BY_TYPE[notification.type] ?? ['Notification']));
    });

    // The server rejects an expired token; refresh it and reconnect.
    socket.on('auth_error', () => {
      void refreshAccessToken().then((token) => {
        if (token) socket.connect();
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [signedIn, dispatch]);
}
