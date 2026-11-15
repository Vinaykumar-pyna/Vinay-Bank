import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon = 'bi-inbox', title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <i className={`bi ${icon} empty-icon d-block mb-2`} aria-hidden="true" />
      <h2 className="h6 text-body mb-1">{title}</h2>
      {description && <p className="small mb-3">{description}</p>}
      {action}
    </div>
  );
}
