import { render, screen } from '@testing-library/react';
import { RailMixList } from './RailMixList';

describe('RailMixList', () => {
  const data = [
    { rail: 'NEFT', count: 4, amount: 75_000_00 },
    { rail: 'INTERNAL', count: 9, amount: 24_500_00 },
    { rail: 'SYSTEM', count: 1, amount: 500_00 },
  ];

  it('prints each share as text next to its bar', () => {
    render(<RailMixList data={data} />);
    expect(screen.getByText('NEFT')).toBeInTheDocument();
    expect(screen.getByText('Within ArthaBank')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('<1%')).toBeInTheDocument();
    expect(screen.getByText('1 txn')).toBeInTheDocument();
  });

  it('exposes every bar as an accessible meter', () => {
    render(<RailMixList data={data} />);
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(3);
    expect(meters[0]).toHaveAttribute('aria-valuenow', '75');
    expect(meters[0]).toHaveAccessibleName('NEFT share of value');
  });

  it('says so when nothing has settled', () => {
    render(<RailMixList data={[]} />);
    expect(screen.getByText('No settled transactions yet.')).toBeInTheDocument();
  });
});
