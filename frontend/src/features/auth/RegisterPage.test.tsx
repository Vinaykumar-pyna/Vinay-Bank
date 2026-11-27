import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import RegisterPage from './RegisterPage';

const mockRegister = jest.fn();

jest.mock('./authApi', () => ({
  useRegisterMutation: () => [mockRegister, { isLoading: false }],
}));

const TERMS_LABEL = 'I agree to the terms and conditions and the privacy policy';
const TERMS_ERROR = 'Please accept the terms and conditions';
const PASSWORD_ERRORS = [
  'Use at least 8 characters',
  'Add a lowercase letter',
  'Add an uppercase letter',
  'Add a number',
  'Add a symbol such as @ or #',
];

type User = ReturnType<typeof userEvent.setup>;

/**
 * Clicks a button the way a browser does: the click handlers run first, with the
 * promise callbacks and re-renders they start, and only then does the browser
 * carry out the click's default action, on the button as it is at that moment.
 * jsdom carries it out straight away instead.
 */
async function clickLikeABrowser(button: HTMLButtonElement, settled: () => Promise<unknown>) {
  const notCancelled = fireEvent.click(button);
  await settled();
  if (notCancelled && button.isConnected && button.type === 'submit') {
    await act(async () => button.form?.requestSubmit(button));
  }
}

/** Fills in the first two steps and opens "Secure your account". */
async function openLastStep(user: User) {
  renderWithProviders(<RegisterPage />, { route: '/register' });

  await user.type(screen.getByLabelText('First name'), 'Asha');
  await user.type(screen.getByLabelText('Last name'), 'Verma');
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1995-06-15' } });
  await user.type(screen.getByLabelText('PAN'), 'abcpv1234k');
  await user.click(screen.getByRole('button', { name: /continue/i }));

  await user.type(await screen.findByLabelText('Email'), 'asha@example.com');
  await user.type(screen.getByLabelText('Mobile number'), '9876501234');
  await user.type(screen.getByLabelText('House and street'), '12 MG Road');
  await user.type(screen.getByLabelText('City'), 'Pune');
  await user.selectOptions(screen.getByLabelText('State'), 'Maharashtra');
  await user.type(screen.getByLabelText('PIN code'), '411001');
  await clickLikeABrowser(screen.getByRole('button', { name: /continue/i }), () =>
    screen.findByLabelText('Password'),
  );

  return {
    password: screen.getByLabelText('Password'),
    confirm: screen.getByLabelText('Confirm password'),
    terms: screen.getByLabelText(TERMS_LABEL),
    create: screen.getByRole('button', { name: 'Create my account' }),
  };
}

function expectNoPasswordError() {
  for (const message of PASSWORD_ERRORS) expect(screen.queryByText(message)).toBeNull();
}

describe('RegisterPage', () => {
  beforeEach(() => mockRegister.mockReset());

  it('opens the last step without any error messages', async () => {
    const user = userEvent.setup({ delay: null });
    const { password, confirm, terms } = await openLastStep(user);

    expectNoPasswordError();
    expect(screen.queryByText('Re-enter your password')).toBeNull();
    expect(screen.queryByText(TERMS_ERROR)).toBeNull();
    for (const field of [password, confirm, terms]) expect(field).not.toHaveClass('is-invalid');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('checks the password once it has been used and left', async () => {
    const user = userEvent.setup({ delay: null });
    const { password } = await openLastStep(user);

    // Entering the field is not enough...
    await user.click(password);
    expectNoPasswordError();
    // ...leaving it empty is.
    await user.tab();
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(password).toHaveClass('is-invalid');

    // From then on the message follows the typing, and goes once the password is valid.
    await user.type(password, 'abcdefgh');
    expect(await screen.findByText('Add an uppercase letter')).toBeInTheDocument();
    await user.clear(password);
    await user.type(password, 'Str0ng@Pass');
    await waitFor(() => expect(password).not.toHaveClass('is-invalid'));
    expectNoPasswordError();
  });

  it('waits until an invalid password is left before saying what is wrong', async () => {
    const user = userEvent.setup({ delay: null });
    const { password } = await openLastStep(user);

    await user.type(password, 'abc');
    expectNoPasswordError();
    await user.tab();
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
  });

  it('keeps the confirmation in step with the password', async () => {
    const user = userEvent.setup({ delay: null });
    const { password, confirm } = await openLastStep(user);

    await user.type(password, 'Str0ng@Pass');
    await user.type(confirm, 'Str0ng@Pass');
    await user.tab();
    expect(screen.queryByText('Passwords do not match')).toBeNull();

    await user.type(password, '9');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    await user.type(confirm, '9');
    await waitFor(() => expect(screen.queryByText('Passwords do not match')).toBeNull());
  });

  it('asks for the terms only when the form is submitted without them', async () => {
    const user = userEvent.setup({ delay: null });
    const { password, confirm, terms, create } = await openLastStep(user);
    await user.type(password, 'Str0ng@Pass');
    await user.type(confirm, 'Str0ng@Pass');

    // Ticking and clearing the box, then moving on, is not a submit attempt.
    await user.click(terms);
    await user.click(terms);
    await user.tab();
    expect(screen.queryByText(TERMS_ERROR)).toBeNull();

    await user.click(create);
    expect(await screen.findByText(TERMS_ERROR)).toBeInTheDocument();
    expect(terms).toHaveClass('is-invalid');
    expect(mockRegister).not.toHaveBeenCalled();

    // Ticking the box removes the message at once.
    await user.click(terms);
    expect(screen.queryByText(TERMS_ERROR)).toBeNull();
    expect(terms).not.toHaveClass('is-invalid');

    // Clearing it again brings the message back only with the next attempt.
    await user.click(terms);
    expect(screen.queryByText(TERMS_ERROR)).toBeNull();
    await user.click(create);
    expect(await screen.findByText(TERMS_ERROR)).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('creates the account once everything is filled in', async () => {
    mockRegister.mockReturnValue({
      unwrap: () => Promise.resolve({ accessToken: 'jwt', user: { firstName: 'Asha' } }),
    });
    const user = userEvent.setup({ delay: null });
    const { password, confirm, terms, create } = await openLastStep(user);

    await user.type(password, 'Str0ng@Pass');
    await user.type(confirm, 'Str0ng@Pass');
    await user.click(terms);
    await user.click(create);

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    const payload = mockRegister.mock.calls[0][0];
    expect(payload).toMatchObject({
      firstName: 'Asha',
      lastName: 'Verma',
      dateOfBirth: '1995-06-15',
      pan: 'ABCPV1234K',
      email: 'asha@example.com',
      phone: '9876501234',
      address: { line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
      password: 'Str0ng@Pass',
      acceptTerms: true,
    });
    expect(payload).not.toHaveProperty('confirmPassword');
    expect(screen.queryByText(TERMS_ERROR)).toBeNull();
  });
});
