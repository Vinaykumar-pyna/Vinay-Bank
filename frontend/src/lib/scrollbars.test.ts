import {
  EDGE_ZONE_PX,
  HIDE_DELAY_MS,
  installAutoHideScrollbars,
  PEEK_CLASS,
  SCROLLING_CLASS,
} from './scrollbars';

function pointerMove(clientX: number, pointerType = 'mouse') {
  // jsdom has no PointerEvent constructor; a MouseEvent with the extra field is equivalent here.
  const event = new MouseEvent('pointermove', { clientX, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  window.dispatchEvent(event);
}

describe('auto-hiding scrollbars', () => {
  let uninstall: () => void;
  const root = document.documentElement;

  beforeEach(() => {
    jest.useFakeTimers();
    uninstall = installAutoHideScrollbars(window);
  });

  afterEach(() => {
    uninstall();
    jest.useRealTimers();
  });

  it('shows the thumb of the element being scrolled until scrolling stops', () => {
    const list = document.createElement('div');
    document.body.append(list);
    list.dispatchEvent(new Event('scroll'));
    expect(list).toHaveClass(SCROLLING_CLASS);

    jest.advanceTimersByTime(HIDE_DELAY_MS - 100);
    list.dispatchEvent(new Event('scroll')); // still scrolling: the timer restarts
    jest.advanceTimersByTime(HIDE_DELAY_MS - 100);
    expect(list).toHaveClass(SCROLLING_CLASS);

    jest.advanceTimersByTime(100);
    expect(list).not.toHaveClass(SCROLLING_CLASS);
    list.remove();
  });

  it('marks the root element when the page itself scrolls', () => {
    document.dispatchEvent(new Event('scroll'));
    expect(root).toHaveClass(SCROLLING_CLASS);
    jest.advanceTimersByTime(HIDE_DELAY_MS);
    expect(root).not.toHaveClass(SCROLLING_CLASS);
  });

  it('reveals the page scrollbar while a mouse is at the right-hand edge', () => {
    pointerMove(window.innerWidth - EDGE_ZONE_PX / 2);
    expect(root).toHaveClass(PEEK_CLASS);
    pointerMove(window.innerWidth / 2);
    expect(root).not.toHaveClass(PEEK_CLASS);
    pointerMove(window.innerWidth - 2, 'touch'); // touch screens use native overlay scrollbars
    expect(root).not.toHaveClass(PEEK_CLASS);
  });

  it('cleans up its classes and listeners when uninstalled', () => {
    document.dispatchEvent(new Event('scroll'));
    pointerMove(window.innerWidth - 1);
    uninstall();
    expect(root).not.toHaveClass(SCROLLING_CLASS);
    expect(root).not.toHaveClass(PEEK_CLASS);
    document.dispatchEvent(new Event('scroll'));
    expect(root).not.toHaveClass(SCROLLING_CLASS);
    uninstall = () => undefined;
  });
});
