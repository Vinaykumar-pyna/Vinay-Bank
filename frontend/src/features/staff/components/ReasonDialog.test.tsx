import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReasonDialog } from './ReasonDialog';

describe('ReasonDialog', () => {
  it('requires a reason before confirming, then passes it on trimmed', async () => {
    const onConfirm = jest.fn();
    render(
      <ReasonDialog
        title="Freeze account"
        confirmLabel="Freeze"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter at least 3 characters.')).toBeVisible();

    await userEvent.type(screen.getByLabelText('Reason'), '  Suspicious activity  ');
    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onConfirm).toHaveBeenCalledWith('Suspicious activity');
  });

  it('shows the API error and disables the buttons while busy', () => {
    render(
      <ReasonDialog
        title="Close account"
        confirmLabel="Close account"
        busy
        error={{
          status: 422,
          code: 'INVALID_STATE',
          message: 'Only accounts with a zero balance can be closed',
        }}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText('Only accounts with a zero balance can be closed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close account' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
