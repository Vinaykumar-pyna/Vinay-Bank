import { useEffect, useRef, type ReactNode } from 'react';
import { useAppSelector } from '@/app/hooks';
import { refreshAccessToken } from '@/lib/session';

/**
 * On first load, tries to restore the session from the httpOnly refresh cookie.
 * Children render immediately; route guards wait while the status is 'unknown'.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.auth.status);
  const started = useRef(false);

  useEffect(() => {
    if (status === 'unknown' && !started.current) {
      started.current = true;
      void refreshAccessToken();
    }
  }, [status]);

  return <>{children}</>;
}
