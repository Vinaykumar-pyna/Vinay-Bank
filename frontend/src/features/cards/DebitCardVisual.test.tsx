import { render, screen } from '@testing-library/react';
import { DebitCardVisual } from './DebitCardVisual';

const card = {
  maskedPan: '6528 45XX XXXX 1234',
  cardholderName: 'PRIYA SHARMA',
  expiry: '11/31',
  variant: 'Platinum Debit',
  status: 'ACTIVE' as const,
};

describe('DebitCardVisual', () => {
  it('shows only the masked number by default', () => {
    render(<DebitCardVisual card={card} />);
    expect(screen.getByText('6528 45XX XXXX 1234')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Platinum Debit card 6528 45XX XXXX 1234, active',
    );
  });

  it('groups a revealed number in fours and greys out an inactive card', () => {
    render(<DebitCardVisual card={{ ...card, status: 'BLOCKED' }} pan="6528451012345678" />);
    expect(screen.getByText('6528 4510 1234 5678')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveClass('is-blocked');
  });
});
