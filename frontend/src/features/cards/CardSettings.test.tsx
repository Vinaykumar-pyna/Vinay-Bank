import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { CardSettings } from './CardSettings';
import type { DebitCard } from './types';

const RUPEE = 100;

function card(overrides: Partial<DebitCard> = {}): DebitCard {
  return {
    id: 'c1',
    accountId: 'a1',
    maskedPan: '6528 45XX XXXX 1234',
    last4: '1234',
    network: 'RUPAY',
    variant: 'Platinum Debit',
    cardholderName: 'PRIYA SHARMA',
    expiry: '11/31',
    status: 'ACTIVE',
    pinSet: true,
    pinLocked: false,
    controls: { atm: true, pos: true, ecommerce: false, contactless: true, international: false },
    limits: { atmDaily: 20_000 * RUPEE, posDaily: 1_00_000 * RUPEE },
    usedToday: { atm: 18_000 * RUPEE, pos: 1_00_000 * RUPEE },
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CardSettings', () => {
  it('reflects each channel switch', () => {
    renderWithProviders(<CardSettings card={card()} />);
    expect(screen.getByRole('checkbox', { name: 'ATM withdrawals' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Online payments' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'International use' })).not.toBeChecked();
  });

  it('colours usage meters by severity and always prints the figures', () => {
    renderWithProviders(<CardSettings card={card()} />);
    const atm = screen.getByRole('meter', { name: 'ATM limit used today' });
    const pos = screen.getByRole('meter', { name: 'Spend limit used today' });
    expect(atm).toHaveAttribute('aria-valuenow', '90');
    expect(atm).toHaveClass('meter-warning');
    expect(pos).toHaveClass('meter-danger');
    expect(screen.getByText('₹18,000.00 of ₹20,000 used today')).toBeInTheDocument();
  });

  it('locks every control on a hotlisted card', () => {
    renderWithProviders(<CardSettings card={card({ status: 'HOTLISTED' })} />);
    for (const control of screen.getAllByRole('checkbox')) expect(control).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save limits' })).toBeDisabled();
  });
});
