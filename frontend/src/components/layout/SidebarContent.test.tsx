import { screen } from '@testing-library/react';
import type { Role, UserProfile } from '@/features/auth/types';
import { renderWithProviders } from '@/test/renderWithProviders';
import { staffNavigation } from './navigation';
import { SidebarContent } from './SidebarContent';

function staffUser(role: Role): UserProfile {
  return {
    id: 'u1',
    role,
    email: 'someone@vinaybank.test',
    phone: '9000000000',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    status: 'ACTIVE',
    kyc: { status: 'VERIFIED' },
    mfaEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderFor(role: Role) {
  return renderWithProviders(
    <SidebarContent sections={staffNavigation} homePath="/staff/dashboard" />,
    {
      preloadedState: {
        auth: { status: 'authenticated', accessToken: 'token', user: staffUser(role) },
      },
    },
  );
}

describe('SidebarContent (staff portal)', () => {
  it('hides checker and administrator pages from tellers', () => {
    renderFor('TELLER');
    expect(screen.getByRole('link', { name: 'Cash counter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit trail' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff users' })).not.toBeInTheDocument();
    // A section whose items are all hidden disappears with its heading.
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('shows the audit trail to managers but not staff administration', () => {
    renderFor('MANAGER');
    expect(screen.getByRole('link', { name: 'Audit trail' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff users' })).not.toBeInTheDocument();
  });

  it('shows every page to administrators', () => {
    renderFor('ADMIN');
    expect(screen.getByRole('link', { name: 'Audit trail' })).toHaveAttribute(
      'href',
      '/staff/audit',
    );
    expect(screen.getByRole('link', { name: 'Staff users' })).toHaveAttribute(
      'href',
      '/staff/users',
    );
    expect(screen.getByText('Administration')).toBeInTheDocument();
  });
});
