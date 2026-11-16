import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WireMessage } from '@/features/cards/types';
import { MessageInspector, type InspectedExchange } from './MessageInspector';

const message = (mti: string, mtiName: string, fields: WireMessage['fields']): WireMessage => ({
  mti,
  mtiName,
  bitmap: '7234448108E09001',
  fields,
  hex: '30323030',
  bytes: 189,
});

const exchange = (id: number, code: string, approved: boolean): InspectedExchange => ({
  id,
  outcome: {
    operation: 'BALANCE',
    terminal: 'Vinay Bank ATM',
    approved,
    responseCode: code,
    message: approved ? 'Approved' : 'Incorrect PIN',
    stan: `00000${id}`,
    transmittedAt: '1114101530',
  },
  exchange: {
    request: message('0200', 'Financial transaction request', [
      { field: 2, name: 'Primary account number', value: '652845******1234' },
      { field: 52, name: 'PIN data', value: '[hidden]' },
    ]),
    response: message('0210', 'Financial transaction response', [
      { field: 39, name: 'Response code', value: code },
    ]),
    roundTripMs: 12.5,
    tls: { protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', serverCertificate: 'localhost' },
  },
});

describe('MessageInspector', () => {
  it('explains that nothing has been sent yet', () => {
    render(<MessageInspector items={[]} />);
    expect(screen.getByText('Nothing on the wire yet')).toBeInTheDocument();
  });

  it('opens the latest exchange with masked fields, bitmap and hex dump', () => {
    render(<MessageInspector items={[exchange(2, '55', false), exchange(1, '00', true)]} />);
    expect(screen.getByText('55 Incorrect PIN')).toBeInTheDocument();
    expect(screen.getByText('652845******1234')).toBeInTheDocument();
    expect(screen.getByText('[hidden]')).toBeInTheDocument();
    expect(screen.getByLabelText('Request bytes')).toHaveTextContent(/0000 30 32 30 30 +0200/);
    expect(screen.getAllByText(/TLSv1\.3/)).toHaveLength(2);
  });

  it('lets another exchange be expanded instead', async () => {
    render(<MessageInspector items={[exchange(2, '55', false), exchange(1, '00', true)]} />);
    const toggles = screen.getAllByRole('button', { name: /messages/ });
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggles[1]);
    expect(screen.getAllByRole('button', { name: /messages/ })[1]).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByRole('button', { name: /messages/ })[0]).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
