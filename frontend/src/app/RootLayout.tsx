import { Outlet } from 'react-router';
import { RouteProgress } from '@/components/common/RouteProgress';

/** Wraps every page: global loading feedback above the matched route. */
export function RootLayout() {
  return (
    <>
      <RouteProgress />
      <Outlet />
    </>
  );
}
