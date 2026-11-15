import type { Role } from '@/features/auth/types';

/**
 * Sidebar navigation, defined as data so each portal (customer or staff)
 * renders the same component with different items. `roles` hides an item from
 * everyone else (the routes and the API enforce the same rule).
 */
export interface NavItem {
  label: string;
  to: string;
  icon: string;
  end?: boolean;
  roles?: readonly Role[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const customerNavigation: NavSection[] = [
  {
    items: [{ label: 'Dashboard', to: '/app/dashboard', icon: 'bi-grid-1x2' }],
  },
  {
    label: 'Banking',
    items: [
      { label: 'Accounts', to: '/app/accounts', icon: 'bi-wallet2' },
      { label: 'Send money', to: '/app/transfer', icon: 'bi-send' },
      { label: 'Cards', to: '/app/cards', icon: 'bi-credit-card-2-front' },
      { label: 'Payees', to: '/app/beneficiaries', icon: 'bi-people' },
      { label: 'Bulk payments', to: '/app/bulk-payments', icon: 'bi-files' },
      { label: 'Transactions', to: '/app/transactions', icon: 'bi-clock-history' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Notifications', to: '/app/notifications', icon: 'bi-bell' },
      { label: 'Profile and security', to: '/app/profile', icon: 'bi-shield-lock' },
    ],
  },
];

export const staffNavigation: NavSection[] = [
  {
    items: [{ label: 'Overview', to: '/staff/dashboard', icon: 'bi-speedometer2' }],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Approvals', to: '/staff/approvals', icon: 'bi-check2-square' },
      { label: 'Customers', to: '/staff/customers', icon: 'bi-people' },
      { label: 'Cash counter', to: '/staff/cash', icon: 'bi-cash-coin' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { label: 'Transactions', to: '/staff/transactions', icon: 'bi-activity' },
      {
        label: 'General ledger',
        to: '/staff/ledger',
        icon: 'bi-journal-text',
        roles: ['MANAGER', 'ADMIN'],
      },
      {
        label: 'Audit trail',
        to: '/staff/audit',
        icon: 'bi-journal-check',
        roles: ['MANAGER', 'ADMIN'],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Staff users', to: '/staff/users', icon: 'bi-person-badge', roles: ['ADMIN'] },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Notifications', to: '/staff/notifications', icon: 'bi-bell' },
      { label: 'Profile and security', to: '/staff/profile', icon: 'bi-shield-lock' },
    ],
  },
];
