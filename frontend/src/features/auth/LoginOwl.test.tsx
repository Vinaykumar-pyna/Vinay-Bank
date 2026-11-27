import { act } from '@testing-library/react';
import { useRef } from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { LoginOwl } from './LoginOwl';

function Harness({ failedAttempts }: { failedAttempts: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef}>
      <LoginOwl formRef={formRef} passwordVisible={false} failedAttempts={failedAttempts} />
    </form>
  );
}

describe('LoginOwl', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('looks worried for a moment after a failed sign-in', () => {
    const { rerender } = renderWithProviders(<Harness failedAttempts={0} />);
    const owl = document.querySelector('.login-owl')!;
    expect(owl).not.toHaveAttribute('data-owl-worried');

    rerender(<Harness failedAttempts={1} />);
    expect(owl).toHaveAttribute('data-owl-worried', 'true');
    act(() => jest.advanceTimersByTime(1400));
    expect(owl).not.toHaveAttribute('data-owl-worried');
  });
});
