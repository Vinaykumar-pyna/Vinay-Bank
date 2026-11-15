import { Link } from 'react-router';
import { LogoMark } from '@/components/common/Logo';

export default function NotFoundPage() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-4">
      <div className="text-center" style={{ maxWidth: 440 }}>
        <LogoMark size={56} />
        <div className="display-4 fw-bold mt-3 text-gradient">404</div>
        <h1 className="h4">This page does not exist</h1>
        <p className="text-body-secondary">
          The link may be broken or the page may have moved. Check the address and try again.
        </p>
        <Link to="/" className="btn btn-primary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
