/**
 * The boot splash is plain HTML in index.html, so it shows while the
 * JavaScript is still downloading. It stays up, animating without a restart,
 * for as long as some full-screen loader wants it (the router loading its
 * first page, the session being restored) and then fades out.
 */
const SPLASH_ID = 'vb-boot-splash';
const LABEL_ID = 'vb-boot-label';
const FADE_MS = 400;

let holds = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

function splash(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(SPLASH_ID);
}

/** Keeps the splash up (optionally with a new label); call the returned function when done. */
export function holdBootSplash(label?: string): () => void {
  holds += 1;
  clearTimeout(releaseTimer);
  const text = document.getElementById(LABEL_ID);
  if (label && text) text.textContent = label;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    releaseBootSplash();
  };
}

/**
 * Fades the splash out once nothing holds it. Deferred by a tick, so a loader
 * that hands over to the next one (for example the router to the session
 * check) does not let the page flash in between.
 */
export function releaseBootSplash(): void {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    const element = splash();
    if (holds > 0 || !element || element.classList.contains('is-leaving')) return;
    element.classList.add('is-leaving');
    setTimeout(() => element.remove(), FADE_MS);
  }, 0);
}
