import { Spinner } from 'react-bootstrap';

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="text-center text-body-secondary">
        <Spinner animation="border" variant="primary" className="mb-2" />
        <div className="small">{label}...</div>
      </div>
    </div>
  );
}
