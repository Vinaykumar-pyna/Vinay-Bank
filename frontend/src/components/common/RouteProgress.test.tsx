import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useNavigation } from 'react-router';
import { makeStore } from '@/app/store';
import { RouteProgress } from './RouteProgress';

// jsdom has no Fetch API Request, which a real data router needs to navigate.
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigation: jest.fn(),
}));
const mockedNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;

function renderWhile(state: 'idle' | 'loading') {
  mockedNavigation.mockReturnValue({ state } as ReturnType<typeof useNavigation>);
  return render(
    <Provider store={makeStore()}>
      <RouteProgress />
    </Provider>,
  );
}

describe('RouteProgress', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the progress bar, then the loading screen, while a page is slow to open', () => {
    const { container } = renderWhile('loading');
    const bar = container.querySelector('.vb-progress');
    expect(bar).not.toHaveClass('is-active'); // nothing flashes for quick page changes
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(250));
    expect(bar).toHaveClass('is-active');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => jest.advanceTimersByTime(200));
    expect(screen.getByRole('status')).toHaveTextContent('Loading page');
  });

  it('stays out of the way when nothing is loading', () => {
    const { container } = renderWhile('idle');
    act(() => jest.advanceTimersByTime(2000));
    expect(container.querySelector('.vb-progress')).not.toHaveClass('is-active');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
