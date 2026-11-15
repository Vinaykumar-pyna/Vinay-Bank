import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="h3 mb-1">{title}</h1>
        {subtitle && <p className="text-body-secondary mb-0">{subtitle}</p>}
      </div>
      {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
