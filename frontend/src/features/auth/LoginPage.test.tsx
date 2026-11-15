import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('shows validation messages instead of calling the API with an empty form', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('rejects a malformed email address', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'anything');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('fills the form from the demo accounts panel', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    await userEvent.click(screen.getByRole('button', { name: /demo accounts/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Kavya Iyer/ }));
    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveValue('manager@arthabank.test'),
    );
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@1234');
  });

  it('toggles password visibility', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
