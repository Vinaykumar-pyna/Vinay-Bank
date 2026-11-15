import { Suspense, type ReactNode } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { Outlet } from 'react-router';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { closeSidebar } from '@/app/uiSlice';
import { PageLoader } from '../common/PageLoader';
import type { NavSection } from './navigation';
import { SidebarContent } from './SidebarContent';
import { Topbar } from './Topbar';

interface AppLayoutProps {
  navigation: NavSection[];
  homePath: string;
  topbarRight?: ReactNode;
}

/**
 * Authenticated shell. On large screens the sidebar is fixed; below the `lg`
 * breakpoint it collapses into an off-canvas drawer opened from the topbar.
 */
export function AppLayout({ navigation, homePath, topbarRight }: AppLayoutProps) {
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const dispatch = useAppDispatch();
  const close = () => dispatch(closeSidebar());

  return (
    <div className="app-shell">
      <a href="#main-content" className="visually-hidden-focusable position-absolute p-2">
        Skip to main content
      </a>

      <aside className="app-sidebar app-sidebar-fixed" aria-label="Sidebar">
        <SidebarContent sections={navigation} homePath={homePath} />
      </aside>

      <Offcanvas show={sidebarOpen} onHide={close} className="app-sidebar" aria-label="Navigation">
        <SidebarContent sections={navigation} homePath={homePath} onNavigate={close} />
      </Offcanvas>

      <div className="app-main">
        <Topbar rightSlot={topbarRight} />
        <main id="main-content" className="app-content" tabIndex={-1}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
