/**
 * Auto-hiding scrollbars (styles: styles/_scrollbars.scss).
 *
 * Scrollbar thumbs are transparent until they are useful. This module marks
 *  - the element being scrolled with `vb-scrolling` until scrolling stops, and
 *  - the page with `vb-scrollbar-peek` while a mouse rests at the right-hand
 *    edge, where the page scrollbar is, so it can be grabbed without scrolling first.
 * Only colours change, never sizes, so showing and hiding never moves the layout.
 */
export const SCROLLING_CLASS = 'vb-scrolling';
export const PEEK_CLASS = 'vb-scrollbar-peek';
/** How long a thumb stays visible after the last scroll event. */
export const HIDE_DELAY_MS = 900;
/** Width of the zone at the right edge of the window (scrollbar included) that reveals the page thumb. */
export const EDGE_ZONE_PX = 28;

export function installAutoHideScrollbars(win: Window = window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const timers = new Map<Element, number>();

  const onScroll = (event: Event) => {
    const { target } = event;
    // The page itself scrolls the root element; its scroll events target the document.
    const element =
      target === doc || target === doc.body ? root : target instanceof Element ? target : null;
    if (!element) return;
    element.classList.add(SCROLLING_CLASS);
    win.clearTimeout(timers.get(element));
    timers.set(
      element,
      win.setTimeout(() => {
        element.classList.remove(SCROLLING_CLASS);
        timers.delete(element);
      }, HIDE_DELAY_MS),
    );
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    // innerWidth includes the scrollbar and, unlike clientWidth, never forces a layout.
    root.classList.toggle(PEEK_CLASS, event.clientX >= win.innerWidth - EDGE_ZONE_PX);
  };

  const onPointerLeave = () => root.classList.remove(PEEK_CLASS);

  // Scroll events do not bubble, but every one passes the document in the capture phase.
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  win.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerleave', onPointerLeave);

  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true });
    win.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerleave', onPointerLeave);
    timers.forEach((timer, element) => {
      win.clearTimeout(timer);
      element.classList.remove(SCROLLING_CLASS);
    });
    timers.clear();
    root.classList.remove(PEEK_CLASS);
  };
}
