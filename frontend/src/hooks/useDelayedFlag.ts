import { useEffect, useRef, useState } from 'react';

/**
 * Follows `active`, but turns on only after it has been true for `delayMs` and,
 * once on, stays on for at least `minVisibleMs`. Loaders use it so quick
 * requests never flash on screen and slow ones never flicker.
 */
export function useDelayedFlag(active: boolean, delayMs: number, minVisibleMs = 0): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active === visible) return undefined;
    const wait = active ? delayMs : Math.max(0, shownAt.current + minVisibleMs - Date.now());
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      setVisible(active);
    }, wait);
    return () => clearTimeout(timer);
  }, [active, visible, delayMs, minVisibleMs]);

  return visible;
}

/**
 * Keeps something mounted for `exitMs` after `visible` turns false, so it can
 * play an exit animation. `leaving` is true during that time.
 */
export function usePresence(visible: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible === mounted) return undefined;
    const timer = setTimeout(() => setMounted(visible), visible ? 0 : exitMs);
    return () => clearTimeout(timer);
  }, [visible, mounted, exitMs]);

  return { mounted: mounted || visible, leaving: mounted && !visible };
}
