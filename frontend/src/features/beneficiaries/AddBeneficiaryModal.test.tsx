import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bank } from '@/features/banking/types';
import { AddBeneficiaryModal } from './AddBeneficiaryModal';

const BANKS: Bank[] = [
  { code: 'VINB', name: 'Vinay Bank', exampleIfsc: 'VINB0000001', isInternal: true },
  { code: 'BARB', name: 'Bank of Baroda', exampleIfsc: 'BARB0ANDHER', isInternal: false },
  { code: 'HDFC', name: 'HDFC Bank', exampleIfsc: 'HDFC0000240', isInternal: false },
  { code: 'SBIN', name: 'State Bank of India', exampleIfsc: 'SBIN0000300', isInternal: false },
];

const mockAddBeneficiary = jest.fn();

jest.mock('@/features/banking/bankingApi', () => ({
  useGetBanksQuery: () => ({ data: BANKS, isLoading: false }),
  useLookupIfscQuery: () => ({ data: undefined, isFetching: false, isError: false }),
  useAddBeneficiaryMutation: () => [mockAddBeneficiary, { isLoading: false }],
}));

function renderModal() {
  render(<AddBeneficiaryModal show onHide={() => undefined} />);
  return {
    bank: screen.getByLabelText('Bank') as HTMLSelectElement,
    ifsc: screen.getByLabelText('IFSC code') as HTMLInputElement,
  };
}

describe('AddBeneficiaryModal bank picker', () => {
  beforeEach(() => mockAddBeneficiary.mockReset());

  it('offers Bank of Baroda with the other banks and fills in the start of its IFSC', async () => {
    const { bank, ifsc } = renderModal();
    expect(screen.getByRole('option', { name: 'Bank of Baroda' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vinay Bank (instant and free)' })).toBeInTheDocument();

    await userEvent.selectOptions(bank, 'BARB');
    expect(ifsc).toHaveValue('BARB0');
    expect(ifsc).toHaveFocus();
    expect(screen.getByText(/Bank of Baroda IFSC codes start with/)).toBeInTheDocument();
  });

  it('follows the bank of an IFSC typed directly', async () => {
    const { bank, ifsc } = renderModal();
    await userEvent.type(ifsc, 'sbin0000300');
    expect(bank).toHaveValue('SBIN');
    await userEvent.clear(ifsc);
    await userEvent.type(ifsc, 'ZZZZ0000001');
    expect(bank).toHaveValue('OTHER');
  });

  it('adds a Bank of Baroda payee using the example IFSC', async () => {
    mockAddBeneficiary.mockReturnValue({ unwrap: () => Promise.resolve({ name: 'Neha Joshi' }) });
    const { bank, ifsc } = renderModal();
    await userEvent.selectOptions(bank, 'BARB');
    await userEvent.click(screen.getByRole('button', { name: 'Use the example IFSC BARB0ANDHER' }));
    expect(ifsc).toHaveValue('BARB0ANDHER');

    await userEvent.type(screen.getByLabelText('Account holder name'), 'Neha Joshi');
    await userEvent.type(screen.getByLabelText('Account number'), '29080100004567');
    await userEvent.type(screen.getByLabelText('Re-enter account number'), '29080100004567');
    await userEvent.click(screen.getByRole('button', { name: 'Add payee' }));

    await waitFor(() =>
      expect(mockAddBeneficiary).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Neha Joshi', ifsc: 'BARB0ANDHER' }),
      ),
    );
  });
});
