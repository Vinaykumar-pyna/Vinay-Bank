import { act, render, screen } from '@testing-library/react';
import { FullScreenLoader, PageLoader } from './PageLoader';

describe('loading screens', () => {
  it('announces what is loading', () => {
    render(<PageLoader label="Loading payees" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading payees');
  });

  describe('with the boot splash from index.html still on screen', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<div id="vb-boot-splash"><div id="vb-boot-label">Loading</div></div>',
      );
    });

    afterEach(() => {
      document.getElementById('vb-boot-splash')?.remove();
      jest.useRealTimers();
    });

    const bootSplash = () => document.getElementById('vb-boot-splash');

    it('keeps the splash up with its own label, then fades it out', () => {
      const { unmount } = render(<FullScreenLoader label="Restoring your secure session" />);
      expect(document.getElementById('vb-boot-label')).toHaveTextContent(
        'Restoring your secure session',
      );

      unmount();
      act(() => jest.advanceTimersByTime(0));
      expect(bootSplash()).toHaveClass('is-leaving');
      act(() => jest.advanceTimersByTime(400));
      expect(bootSplash()).toBeNull();
    });

    it('does not let the page flash when one loader hands over to the next', () => {
      const first = render(<FullScreenLoader />);
      first.unmount();
      const second = render(<FullScreenLoader label="Restoring your secure session" />);
      act(() => jest.advanceTimersByTime(1000));
      expect(bootSplash()).not.toHaveClass('is-leaving');
      second.unmount();
      act(() => jest.advanceTimersByTime(0));
      expect(bootSplash()).toHaveClass('is-leaving');
    });

    it('leaves the splash alone when it is only the page-change overlay', () => {
      const { unmount } = render(<FullScreenLoader overlay label="Loading page" />);
      unmount();
      act(() => jest.advanceTimersByTime(1000));
      expect(bootSplash()).not.toHaveClass('is-leaving');
    });
  });
});
