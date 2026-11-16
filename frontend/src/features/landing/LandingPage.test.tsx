import { screen } from '@testing-library/react';
import type { AuthState } from '@/features/auth/authSlice';
import type { Role, UserProfile } from '@/features/auth/types';
import { renderWithProviders } from '@/test/renderWithProviders';
import LandingPage from './LandingPage';

// The footer's live API status polls the backend; not what these tests are about.
jest.mock('./ApiStatus', () => ({ ApiStatus: () => null }));

const VISITOR_LINKS = ['Sign in', 'Open an account', 'Get started', 'I already bank here'];

function renderAs(auth: AuthState) {
  return renderWithProviders(<LandingPage />, { preloadedState: { auth } });
}

function signedIn(role: Role, firstName: string): AuthState {
  const user = { id: 'u1', role, firstName, fullName: `${firstName} Test` } as UserProfile;
  return { status: 'authenticated', accessToken: 'token', user };
}

describe('LandingPage calls to action', () => {
  it('invites visitors to sign in or open an account', () => {
    renderAs({ status: 'anonymous', accessToken: null, user: null });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'I already bank here' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Open an account' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('offers a signed-in customer the way back to their dashboard instead', () => {
    renderAs(signedIn('CUSTOMER', 'Priya'));
    for (const name of VISITOR_LINKS) {
      expect(screen.queryByRole('link', { name: new RegExp(name) })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/app/dashboard',
    );
    expect(screen.getByRole('link', { name: /Go to your dashboard/ })).toHaveAttribute(
      'href',
      '/app/dashboard',
    );
    expect(screen.getByText('Signed in as Priya')).toBeInTheDocument();
  });

  it('sends signed-in staff to the staff portal', () => {
    renderAs(signedIn('MANAGER', 'Kavya'));
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/staff/dashboard',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows neither while the session is still being restored after a reload', () => {
    renderAs({ status: 'unknown', accessToken: null, user: null });
    for (const name of VISITOR_LINKS) {
      expect(screen.queryByRole('link', { name: new RegExp(name) })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Checking your session')).toHaveLength(2);
  });
});
