import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { PageLoader } from '@/components/common/PageLoader';
import { homePathFor, type Role } from './types';

interface RequireAuthProps {
  roles?: readonly Role[];
  children: ReactNode;
}

/**
 * Protects a route tree. While the session is being restored it shows a loader;
 * anonymous users go to /login (and come back afterwards); users without the
 * required role are sent to their own home page. The API enforces the same
 * rules on the server; this guard is only for user experience.
 */
export function RequireAuth({ roles, children }: RequireAuthProps) {
  const { status, user } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (status === 'unknown') return <PageLoader label="Restoring your secure session" />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

/**
 * Login and registration pages. Once signed in, users go back to the page they
 * originally asked for (RequireAuth stores it in location.state) or to their home page.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAppSelector((state) => state.auth);
  const location = useLocation();
  if (status === 'unknown') return <PageLoader />;
  if (status === 'authenticated' && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homePathFor(user.role)} replace />;
  }
  return <>{children}</>;
}
