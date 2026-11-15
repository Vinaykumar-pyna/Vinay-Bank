import type { ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import { useAppDispatch } from '@/app/hooks';
import { openSidebar } from '@/app/uiSlice';
import { ThemeToggle } from '../common/ThemeToggle';
import { usePageTitle } from './usePageTitle';

interface TopbarProps {
  rightSlot?: ReactNode;
}

export function Topbar({ rightSlot }: TopbarProps) {
  const dispatch = useAppDispatch();
  const title = usePageTitle();

  return (
    <header className="app-topbar d-flex align-items-center px-3 px-md-4 gap-2">
      <Button
        variant="link"
        className="d-lg-none text-body p-2 lh-1"
        onClick={() => dispatch(openSidebar())}
        aria-label="Open navigation menu"
      >
        <i className="bi bi-list fs-4" aria-hidden="true" />
      </Button>
      <h2 className="h6 mb-0 fw-semibold text-truncate">{title}</h2>
      <div className="ms-auto d-flex align-items-center gap-1">
        <ThemeToggle />
        {rightSlot}
      </div>
    </header>
  );
}
