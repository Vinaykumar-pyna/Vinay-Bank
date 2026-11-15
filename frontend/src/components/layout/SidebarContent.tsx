import { NavLink } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { env } from '@/config/env';
import { Logo } from '../common/Logo';
import type { NavSection } from './navigation';

interface SidebarContentProps {
  sections: NavSection[];
  homePath: string;
  onNavigate?: () => void;
}

export function SidebarContent({ sections, homePath, onNavigate }: SidebarContentProps) {
  const role = useAppSelector((state) => state.auth.user?.role);
  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
    }))
    .filter((section) => section.items.length > 0);
  return (
    <div className="d-flex flex-column h-100">
      <div className="px-3 d-flex align-items-center" style={{ height: 'var(--ab-topbar-height)' }}>
        <Logo to={homePath} />
      </div>
      <nav className="flex-grow-1 overflow-auto px-2 pb-3" aria-label="Main navigation">
        {visible.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label && <div className="sidebar-section-label">{section.label}</div>}
            <ul className="list-unstyled mb-0 d-grid gap-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className="nav-link-ab" onClick={onNavigate}>
                    <i className={`bi ${item.icon}`} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-top small text-body-secondary d-flex align-items-center gap-2">
        <i className="bi bi-shield-lock" aria-hidden="true" />
        <span>Secured with 256-bit encryption</span>
        <span className="ms-auto font-mono">v{env.appVersion}</span>
      </div>
    </div>
  );
}
