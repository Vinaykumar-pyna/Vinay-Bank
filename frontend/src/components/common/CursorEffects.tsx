import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/** A mouse or trackpad (not a touch screen). */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Anything a click acts on: the ring grows and fills over these. */
const INTERACTIVE = [
  'a[href]',
  'button',
  'summary',
  'select',
  'label[for]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="reset"]',
  'input[type="file"]',
  'input[type="range"]',
].join(', ');

/** Text fields: the dot becomes a text bar and the ring steps aside. */
const TEXT_ENTRY =
  'input:not([type="checkbox"], [type="radio"], [type="submit"], [type="button"], [type="reset"], [type="file"], [type="range"]), textarea, [contenteditable]:not([contenteditable="false"])';

const DISABLED = ':disabled, [aria-disabled="true"], .disabled';

/** Share of the remaining distance the ring covers per 60 Hz frame (lower trails more). */
const FOLLOW = 0.32;

/**
 * Set on <html> while the animated cursor is on screen; the stylesheet then
 * hides the system cursor (styles/_interactions.scss).
 */
export const CURSOR_ATTRIBUTE = 'data-cursor';

/**
 * The app's cursor on devices with a mouse or trackpad. A dot sits exactly on
 * the pointer, so clicks land where it points; a soft ring trails it, grows and
 * tints over links, buttons and other clickable elements, and dims over
 * disabled ones; over text fields the dot becomes a text bar; every click sends
 * out a small ripple. While it is on screen it is the only cursor: the system
 * cursor is hidden everywhere. Whenever it is not on screen (pointer outside
 * the window, window in the background) the system cursor is back, so there is
 * always exactly one. The layer ignores the pointer, so clicking, text
 * selection and accessibility tools work as before. Touch screens keep their
 * usual behaviour.
 */
export function CursorEffects() {
  const finePointer = useMediaQuery(FINE_POINTER);
  return finePointer ? createPortal(<CursorLayer />, document.body) : null;
}

function CursorLayer() {
  const layerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const cursor = cursorRef.current;
    const trail = trailRef.current;
    const point = pointRef.current;
    if (!layer || !cursor || !trail || !point) return undefined;
    const root = document.documentElement;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let lastTime = 0;
    let visible = false;

    const place = (element: HTMLElement, left: number, top: number) => {
      element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };

    // Eases the ring towards the pointer; stops scheduling frames once it has arrived.
    const step = (time: number) => {
      const elapsed = lastTime ? Math.min(64, time - lastTime) : 16.7;
      lastTime = time;
      const ease = 1 - Math.pow(1 - FOLLOW, elapsed / 16.7);
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      place(trail, x, y);
      if (Math.abs(targetX - x) > 0.1 || Math.abs(targetY - y) > 0.1) {
        frame = requestAnimationFrame(step);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };

    const show = () => {
      visible = true;
      cursor.classList.add('is-visible');
      root.setAttribute(CURSOR_ATTRIBUTE, 'custom');
    };

    const hide = () => {
      visible = false;
      cursor.classList.remove('is-visible', 'is-pressed');
      root.removeAttribute(CURSOR_ATTRIBUTE);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      targetX = event.clientX;
      targetY = event.clientY;
      place(point, targetX, targetY); // never lags: it marks where a click lands
      if (!visible) {
        // Appear right at the pointer instead of sliding in from the last position.
        x = targetX;
        y = targetY;
        place(trail, x, y);
        show();
      }
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onOver = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const field = element?.closest(TEXT_ENTRY);
      const control = element?.closest(INTERACTIVE);
      const disabled = !!(field || control) && !!element?.closest(DISABLED);
      cursor.classList.toggle('is-text', !!field && !disabled);
      cursor.classList.toggle('is-interactive', !field && !!control && !disabled);
      cursor.classList.toggle('is-disabled', disabled);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      onMove(event); // a press can arrive without a move first (pens, some tablets)
      cursor.classList.add('is-pressed');
      const ripple = document.createElement('span');
      ripple.className = 'vb-cursor-ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      layer.append(ripple);
      const remove = () => ripple.remove();
      ripple.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, 1000); // in case the animation never runs (tab in the background)
    };

    const onUp = () => cursor.classList.remove('is-pressed');

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('blur', hide);
    root.addEventListener('pointerleave', hide);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', hide);
      root.removeEventListener('pointerleave', hide);
      root.removeAttribute(CURSOR_ATTRIBUTE);
    };
  }, []);

  return (
    <div ref={layerRef} className="vb-cursor-layer" aria-hidden="true">
      <div ref={cursorRef} className="vb-cursor">
        <div ref={trailRef} className="vb-cursor__trail">
          <span className="vb-cursor__ring" />
        </div>
        <div ref={pointRef} className="vb-cursor__point">
          <span className="vb-cursor__dot" />
        </div>
      </div>
    </div>
  );
}
