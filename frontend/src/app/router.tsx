import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { FullScreenLoader } from '@/components/common/PageLoader';
import { RouteErrorPage } from '@/components/common/RouteErrorPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { customerNavigation, staffNavigation } from '@/components/layout/navigation';
import { UserMenu } from '@/components/layout/UserMenu';
import { GuestOnly, RequireAuth } from '@/features/auth/guards';
import { STAFF_ROLES } from '@/features/auth/types';
import LandingPage from '@/features/landing/LandingPage';
import NotFoundPage from '@/features/misc/NotFoundPage';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { RootLayout } from './RootLayout';

/** Route-level code splitting: each page becomes its own JS chunk, loaded on first visit. */
const page = (loader: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await loader()).default,
});

const securityPage = page(() => import('@/features/profile/SecurityPage'));
const notificationsPage = page(() => import('@/features/notifications/NotificationsPage'));

const topbarRight = (
  <>
    <NotificationBell />
    <UserMenu />
  </>
);

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullScreenLoader,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        path: '/login',
        lazy: async () => {
          const { default: LoginPage } = await import('@/features/auth/LoginPage');
          return {
            element: (
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            ),
          };
        },
      },
      {
        path: '/register',
        lazy: async () => {
          const { default: RegisterPage } = await import('@/features/auth/RegisterPage');
          return {
            element: (
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            ),
          };
        },
      },

      // ATM and shop terminal simulator (public, like a real ATM; the API enables it in demo mode)
      {
        path: '/simulator',
        handle: { title: 'Card network simulator' },
        lazy: page(() => import('@/features/simulator/SimulatorPage')),
      },

      // Customer internet banking
      {
        path: '/app',
        element: (
          <RequireAuth roles={['CUSTOMER']}>
            <AppLayout
              navigation={customerNavigation}
              homePath="/app/dashboard"
              topbarRight={topbarRight}
            />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            handle: { title: 'Dashboard' },
            lazy: page(() => import('@/features/dashboard/DashboardPage')),
          },
          {
            path: 'accounts',
            handle: { title: 'Accounts' },
            lazy: page(() => import('@/features/accounts/AccountsPage')),
          },
          {
            path: 'accounts/:id',
            handle: { title: 'Account statement' },
            lazy: page(() => import('@/features/accounts/AccountDetailsPage')),
          },
          {
            path: 'transfer',
            handle: { title: 'Send money' },
            lazy: page(() => import('@/features/transfers/TransferPage')),
          },
          {
            path: 'cards',
            handle: { title: 'Cards' },
            lazy: page(() => import('@/features/cards/CardsPage')),
          },
          {
            path: 'bulk-payments',
            handle: { title: 'Bulk payments' },
            lazy: page(() => import('@/features/bulk/BulkPaymentsPage')),
          },
          {
            path: 'beneficiaries',
            handle: { title: 'Payees' },
            lazy: page(() => import('@/features/beneficiaries/BeneficiariesPage')),
          },
          {
            path: 'transactions',
            handle: { title: 'Transactions' },
            lazy: page(() => import('@/features/transactions/TransactionsPage')),
          },
          {
            path: 'transactions/:id',
            handle: { title: 'Transaction details' },
            lazy: page(() => import('@/features/transactions/TransactionDetailsPage')),
          },
          { path: 'notifications', handle: { title: 'Notifications' }, lazy: notificationsPage },
          { path: 'profile', handle: { title: 'Profile and security' }, lazy: securityPage },
        ],
      },

      // Branch and administration portal
      {
        path: '/staff',
        element: (
          <RequireAuth roles={STAFF_ROLES}>
            <AppLayout
              navigation={staffNavigation}
              homePath="/staff/dashboard"
              topbarRight={topbarRight}
            />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            handle: { title: 'Overview' },
            lazy: page(() => import('@/features/staff/StaffDashboardPage')),
          },
          {
            path: 'approvals',
            handle: { title: 'Approvals' },
            lazy: page(() => import('@/features/staff/approvals/ApprovalsPage')),
          },
          {
            path: 'customers',
            handle: { title: 'Customers' },
            lazy: page(() => import('@/features/staff/customers/CustomersPage')),
          },
          {
            path: 'customers/:id',
            handle: { title: 'Customer' },
            lazy: page(() => import('@/features/staff/customers/CustomerDetailPage')),
          },
          {
            path: 'cash',
            handle: { title: 'Cash counter' },
            lazy: page(() => import('@/features/staff/cash/CashOperationsPage')),
          },
          {
            path: 'transactions',
            handle: { title: 'Transaction monitor' },
            lazy: page(() => import('@/features/staff/monitor/TransactionsMonitorPage')),
          },
          {
            // Checkers only: the audit trail
            element: (
              <RequireAuth roles={['MANAGER', 'ADMIN']}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              {
                path: 'audit',
                handle: { title: 'Audit trail' },
                lazy: page(() => import('@/features/staff/audit/AuditPage')),
              },
              {
                path: 'ledger',
                handle: { title: 'General ledger' },
                lazy: page(() => import('@/features/staff/ledger/LedgerPage')),
              },
            ],
          },
          {
            // Administrators only: staff logins
            element: (
              <RequireAuth roles={['ADMIN']}>
                <Outlet />
              </RequireAuth>
            ),
            children: [
              {
                path: 'users',
                handle: { title: 'Staff users' },
                lazy: page(() => import('@/features/staff/users/StaffUsersPage')),
              },
            ],
          },
          { path: 'notifications', handle: { title: 'Notifications' }, lazy: notificationsPage },
          { path: 'profile', handle: { title: 'Profile and security' }, lazy: securityPage },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
