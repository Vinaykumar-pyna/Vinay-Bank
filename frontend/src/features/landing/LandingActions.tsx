import { Link } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectAuthStatus, selectCurrentUser } from '@/features/auth/authSlice';
import { homePathFor, type UserProfile } from '@/features/auth/types';

type Visitor =
  | { kind: 'checking' }
  | { kind: 'visitor' }
  | { kind: 'signed-in'; user: UserProfile; home: string };

/**
 * Who is looking at the landing page. After a reload the session is restored
 * from the refresh cookie in the background (AuthBootstrap); until that
 * finishes the answer is "checking", so a signed-in user never sees a flash of
 * "Sign in". The components re-render as soon as the auth state changes.
 */
function useVisitor(): Visitor {
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectCurrentUser);
  if (status === 'anonymous') return { kind: 'visitor' };
  if (status === 'authenticated' && user) {
    return { kind: 'signed-in', user, home: homePathFor(user.role) };
  }
  return { kind: 'checking' };
}

/** Button-shaped placeholder that keeps the layout steady while the session is checked. */
function Pending({ large = false }: { large?: boolean }) {
  return (
    <span className="placeholder-glow">
      <span
        className={`placeholder btn btn-primary disabled ${large ? 'btn-lg' : ''}`}
        style={{ width: large ? '14rem' : '9rem' }}
        aria-hidden="true"
      />
      <span className="visually-hidden">Checking your session</span>
    </span>
  );
}

/** Navbar: sign-in and sign-up for visitors, the way back to the dashboard for users. */
export function NavbarActions() {
  const visitor = useVisitor();
  if (visitor.kind === 'checking') return <Pending />;
  if (visitor.kind === 'signed-in') {
    return (
      <Link to={visitor.home} className="btn btn-primary">
        <i className="bi bi-grid-1x2 me-1" aria-hidden="true" /> Go to dashboard
      </Link>
    );
  }
  return (
    <>
      <Link to="/login" className="btn btn-outline-primary">
        Sign in
      </Link>
      <Link to="/register" className="btn btn-primary">
        Open an account
      </Link>
    </>
  );
}

/** Hero buttons, with the same rules as the navbar. */
export function HeroActions() {
  const visitor = useVisitor();
  if (visitor.kind === 'checking') return <Pending large />;
  if (visitor.kind === 'signed-in') {
    return (
      <>
        <Link to={visitor.home} className="btn btn-primary btn-lg">
          Go to your dashboard <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
        </Link>
        <span className="align-self-center text-body-secondary">
          <i className="bi bi-person-check me-1" aria-hidden="true" />
          Signed in as {visitor.user.firstName}
        </span>
      </>
    );
  }
  return (
    <>
      <Link to="/register" className="btn btn-primary btn-lg">
        Get started <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
      </Link>
      <Link to="/login" className="btn btn-outline-secondary btn-lg">
        I already bank here
      </Link>
    </>
  );
}
