import { act, render, waitFor } from '@testing-library/react';
import { CURSOR_ATTRIBUTE, CursorEffects } from './CursorEffects';

function pointer(type: string, target: EventTarget, init: MouseEventInit = {}) {
  // jsdom has no PointerEvent constructor; a MouseEvent with the extra field is equivalent here.
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  act(() => {
    target.dispatchEvent(event);
  });
}

/** Pretends to be a desktop with a mouse or trackpad. */
function emulateMouse() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  })) as typeof matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function translation(element: Element) {
  const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)/.exec(
    (element as HTMLElement).style.transform,
  );
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const root = document.documentElement;

describe('CursorEffects', () => {
  afterEach(() => root.removeAttribute(CURSOR_ATTRIBUTE));

  it('stays off on touch screens and leaves the system cursor alone', () => {
    render(<CursorEffects />);
    expect(document.querySelector('.vb-cursor')).toBeNull();
    pointer('pointermove', window, { clientX: 40, clientY: 50 });
    expect(root).not.toHaveAttribute(CURSOR_ATTRIBUTE);
  });

  describe('with a mouse', () => {
    let restore: () => void;
    beforeEach(() => {
      restore = emulateMouse();
    });
    afterEach(() => restore());

    it('hides the system cursor only while the animated one is on screen', () => {
      const { unmount } = render(<CursorEffects />);
      const cursor = document.querySelector('.vb-cursor')!;
      expect(document.querySelector('.vb-cursor-layer')).toHaveAttribute('aria-hidden', 'true');
      // Nothing is hidden until the pointer has been seen.
      expect(root).not.toHaveAttribute(CURSOR_ATTRIBUTE);

      pointer('pointermove', window, { clientX: 40, clientY: 50 });
      expect(cursor).toHaveClass('is-visible');
      expect(root).toHaveAttribute(CURSOR_ATTRIBUTE, 'custom');

      // Pointer leaves the page: the system cursor is back.
      pointer('pointerleave', root);
      expect(cursor).not.toHaveClass('is-visible');
      expect(root).not.toHaveAttribute(CURSOR_ATTRIBUTE);

      pointer('pointermove', window, { clientX: 41, clientY: 50 });
      expect(root).toHaveAttribute(CURSOR_ATTRIBUTE, 'custom');

      // Window goes to the background.
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      expect(root).not.toHaveAttribute(CURSOR_ATTRIBUTE);

      pointer('pointermove', window, { clientX: 42, clientY: 50 });
      unmount();
      expect(root).not.toHaveAttribute(CURSOR_ATTRIBUTE);
    });

    it('keeps the dot exactly on the pointer while the ring trails behind it', async () => {
      render(<CursorEffects />);
      const point = document.querySelector('.vb-cursor__point')!;
      const trail = document.querySelector('.vb-cursor__trail')!;

      // Appears right at the pointer.
      pointer('pointermove', window, { clientX: 40, clientY: 50 });
      expect(translation(point)).toEqual([40, 50]);
      expect(translation(trail)).toEqual([40, 50]);

      pointer('pointermove', window, { clientX: 100, clientY: 120 });
      expect(translation(point)).toEqual([100, 120]);
      expect(translation(trail)).toEqual([40, 50]);

      await waitFor(() => {
        const [x, y] = translation(trail)!;
        expect(x).toBeCloseTo(100, 0);
        expect(y).toBeCloseTo(120, 0);
      });

      // A press that arrives without a move first (pens, some tablets) still lands on the dot.
      pointer('pointerdown', window, { clientX: 7, clientY: 9, button: 0 });
      expect(translation(point)).toEqual([7, 9]);
    });

    it('highlights clickable elements, dims disabled ones, turns into a text bar over fields and ripples on click', () => {
      render(
        <div>
          <button type="button">Pay</button>
          <button type="button" disabled>
            Locked
          </button>
          <input aria-label="Amount" />
          <input aria-label="Account number" disabled />
        </div>,
      );
      render(<CursorEffects />);
      const cursor = document.querySelector('.vb-cursor')!;
      const [pay, locked] = document.querySelectorAll('button');
      const [field, lockedField] = document.querySelectorAll('input');

      pointer('pointermove', window, { clientX: 40, clientY: 50 });

      pointer('pointerover', pay);
      expect(cursor).toHaveClass('is-interactive');
      expect(cursor).not.toHaveClass('is-disabled');

      pointer('pointerover', locked);
      expect(cursor).not.toHaveClass('is-interactive');
      expect(cursor).toHaveClass('is-disabled');

      pointer('pointerover', field);
      expect(cursor).toHaveClass('is-text');
      expect(cursor).not.toHaveClass('is-interactive');
      expect(cursor).not.toHaveClass('is-disabled');

      pointer('pointerover', lockedField);
      expect(cursor).not.toHaveClass('is-text');
      expect(cursor).toHaveClass('is-disabled');

      pointer('pointerover', document.body);
      expect(cursor).not.toHaveClass('is-text');
      expect(cursor).not.toHaveClass('is-interactive');
      expect(cursor).not.toHaveClass('is-disabled');

      pointer('pointerdown', window, { clientX: 40, clientY: 50, button: 0 });
      expect(cursor).toHaveClass('is-pressed');
      expect(document.querySelectorAll('.vb-cursor-ripple')).toHaveLength(1);
      pointer('pointerup', window);
      expect(cursor).not.toHaveClass('is-pressed');
    });
  });
});
