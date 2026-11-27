import { useEffect, useId, useRef, useState, type RefObject } from 'react';

type OwlState = 'idle' | 'watching' | 'covering';
type WatchedField = 'email' | 'password';

interface LoginOwlProps {
  /** The sign-in form. Fields marked data-owl="email" or data-owl="password" are watched. */
  formRef: RefObject<HTMLFormElement | null>;
  /** The password is currently shown as plain text. */
  passwordVisible: boolean;
  /** Goes up by one every time sign-in fails; the owl shakes its head. */
  failedAttempts: number;
}

/** How far (in artboard units) the irises can move inside the eyes. */
const LOOK_RANGE = 4.2;
/** Centre of the eyes on the 160 x 150 artboard. */
const EYES_X = 80 / 160;
const EYES_Y = 62 / 150;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** Approximate screen position of the text cursor in an input (good enough to aim the eyes). */
function caretPoint(input: HTMLInputElement) {
  const rect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const fontSize = parseFloat(style.fontSize) || 15;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const caret = input.selectionEnd ?? input.value.length;
  const x = rect.left + paddingLeft + caret * fontSize * 0.56 - input.scrollLeft;
  return { x: Math.min(x, rect.right - 8), y: rect.top + rect.height / 2 };
}

/**
 * Aims the eyes (and tilts the head a little) at a point on the screen; null looks
 * straight ahead. Writes CSS variables directly, so following the pointer or the
 * text cursor never re-renders React.
 */
function aimEyes(
  owl: SVGSVGElement | null,
  point: { x: number; y: number } | null,
  reach = 140,
  maxTilt = 9,
) {
  if (!owl) return;
  let lookX = 0;
  let lookY = 0;
  let tilt = 0;
  if (point) {
    const box = owl.getBoundingClientRect();
    const dx = point.x - (box.left + box.width * EYES_X);
    const dy = point.y - (box.top + box.height * EYES_Y);
    const distance = Math.hypot(dx, dy) || 1;
    const strength = Math.min(1, distance / reach) * LOOK_RANGE;
    lookX = (dx / distance) * strength;
    lookY = (dy / distance) * strength;
    tilt = clamp(dx / 32, maxTilt);
  }
  owl.style.setProperty('--owl-look-x', `${lookX.toFixed(2)}px`);
  owl.style.setProperty('--owl-look-y', `${lookY.toFixed(2)}px`);
  owl.style.setProperty('--owl-tilt', `${tilt.toFixed(2)}deg`);
}

function fieldOf(target: EventTarget | null): WatchedField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest('[data-owl]')?.getAttribute('data-owl');
  return field === 'email' || field === 'password' ? field : null;
}

/**
 * The sign-in mascot, an owl that guards the form: it follows the pointer while
 * idle, watches the text cursor while the email is typed, covers its eyes with
 * its wings while the password is typed (and turns its head away if the
 * password is revealed), and shakes its head when sign-in fails. It is purely
 * decorative: hidden from screen readers, it never takes focus or input.
 */
export function LoginOwl({ formRef, passwordVisible, failedAttempts }: LoginOwlProps) {
  const ids = useId();
  const bodyGradient = `${ids}-body`;
  const wingGradient = `${ids}-wing`;
  const leftEyeClip = `${ids}-left-eye`;
  const rightEyeClip = `${ids}-right-eye`;

  const rootRef = useRef<SVGSVGElement>(null);
  const shakeRef = useRef<SVGGElement>(null);
  const [field, setField] = useState<WatchedField | null>(null);

  const state: OwlState =
    field === 'password' ? 'covering' : field === 'email' ? 'watching' : 'idle';

  // Follow focus and typing in the form.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;

    const watchCaret = (event: Event) => {
      if (fieldOf(event.target) === 'email' && event.target instanceof HTMLInputElement) {
        aimEyes(rootRef.current, caretPoint(event.target));
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const next = fieldOf(event.target);
      setField(next);
      if (next === 'email') watchCaret(event);
      else aimEyes(rootRef.current, null);
    };
    const onFocusOut = (event: FocusEvent) => {
      // Moving between the watched fields (or to the show-password button) keeps the pose.
      if (fieldOf(event.relatedTarget)) return;
      setField(null);
      aimEyes(rootRef.current, null);
    };

    form.addEventListener('focusin', onFocusIn);
    form.addEventListener('focusout', onFocusOut);
    for (const type of ['input', 'keyup', 'click', 'select']) form.addEventListener(type, watchCaret);
    return () => {
      form.removeEventListener('focusin', onFocusIn);
      form.removeEventListener('focusout', onFocusOut);
      for (const type of ['input', 'keyup', 'click', 'select']) {
        form.removeEventListener(type, watchCaret);
      }
    };
  }, [formRef]);

  // While idle, the eyes follow the mouse pointer (gently, at most once per frame).
  useEffect(() => {
    if (state !== 'idle') return undefined;
    let frame = 0;
    let point: { x: number; y: number } | null = null;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      point = { x: event.clientX, y: event.clientY };
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        aimEyes(rootRef.current, point, 260, 4);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [state]);

  // Sign-in failed: worried brows for a moment and a short "no" shake of the head.
  useEffect(() => {
    const owl = rootRef.current;
    const head = shakeRef.current;
    if (!failedAttempts || !owl || !head) return undefined;
    owl.setAttribute('data-owl-worried', 'true');
    const calm = setTimeout(() => owl.removeAttribute('data-owl-worried'), 1400);
    const shake =
      typeof head.animate === 'function'
        ? head.animate(
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(-6px) rotate(-4deg)' },
              { transform: 'translateX(6px) rotate(4deg)' },
              { transform: 'translateX(-4px) rotate(-3deg)' },
              { transform: 'translateX(4px) rotate(3deg)' },
              { transform: 'translateX(0)' },
            ],
            { duration: 650, easing: 'ease-in-out' },
          )
        : null;
    return () => {
      clearTimeout(calm);
      owl.removeAttribute('data-owl-worried');
      shake?.cancel();
    };
  }, [failedAttempts]);

  return (
    <svg
      ref={rootRef}
      className="login-owl"
      viewBox="0 0 160 150"
      data-owl-state={state}
      data-owl-shy={state === 'covering' && passwordVisible ? 'true' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* One gradient in artboard units for head, body and eyelids, so they join seamlessly. */}
        <linearGradient id={bodyGradient} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="145">
          <stop offset="0" stopColor="#7270f7" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id={wingGradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#312e81" />
        </linearGradient>
        <clipPath id={leftEyeClip}>
          <circle cx="64" cy="62" r="14" />
        </clipPath>
        <clipPath id={rightEyeClip}>
          <circle cx="96" cy="62" r="14" />
        </clipPath>
      </defs>

      <ellipse className="login-owl__shadow" cx="80" cy="145" rx="36" ry="4" />

      <g className="login-owl__body">
        <ellipse cx="80" cy="100" rx="46" ry="43" fill={`url(#${bodyGradient})`} />
        <ellipse className="login-owl__belly" cx="80" cy="110" rx="29" ry="29" />
        <path
          className="login-owl__feathers"
          d="M68 98q4 4 8 0M84 98q4 4 8 0M60 109q4 4 8 0M76 109q4 4 8 0M92 109q4 4 8 0M68 120q4 4 8 0M84 120q4 4 8 0"
        />
        <g className="login-owl__feet">
          <path d="M63 139q3 6 6 0M69 139q3 6 6 0" />
          <path d="M85 139q3 6 6 0M91 139q3 6 6 0" />
        </g>
        <g className="login-owl__wing login-owl__wing--left">
          <path d="M51 78C36 88 31 111 40 134c12-12 17-31 15-53z" fill={`url(#${wingGradient})`} />
          <path className="login-owl__wing-lines" d="M42 112q6-3 9-11M41 122q6-3 10-10" />
        </g>
        <g className="login-owl__wing login-owl__wing--right">
          <path d="M109 78c15 10 20 33 11 56-12-12-17-31-15-53z" fill={`url(#${wingGradient})`} />
          <path className="login-owl__wing-lines" d="M118 112q-6-3-9-11M119 122q-6-3-10-10" />
        </g>
      </g>

      <g ref={shakeRef} className="login-owl__shake">
        <g className="login-owl__head">
          <path className="login-owl__tuft" d="M48 44 38 17l28 15z" fill={`url(#${bodyGradient})`} />
          <path className="login-owl__tuft" d="m112 44 10-27-28 15z" fill={`url(#${bodyGradient})`} />
          <circle cx="80" cy="62" r="39" fill={`url(#${bodyGradient})`} />
          <circle className="login-owl__face" cx="64" cy="62" r="21" />
          <circle className="login-owl__face" cx="96" cy="62" r="21" />

          {(
            [
              [64, leftEyeClip],
              [96, rightEyeClip],
            ] as const
          ).map(([cx, clip]) => (
            <g key={cx} className="login-owl__eye">
              <circle className="login-owl__sclera" cx={cx} cy="62" r="14" />
              <g className="login-owl__iris">
                <circle className="login-owl__iris-ring" cx={cx} cy="62" r="9.5" />
                <circle className="login-owl__pupil" cx={cx} cy="62" r="5" />
                <circle className="login-owl__glint" cx={cx + 2.6} cy="59.4" r="1.9" />
              </g>
              <g clipPath={`url(#${clip})`}>
                <circle className="login-owl__lid" cx={cx} cy="32" r="15" fill={`url(#${bodyGradient})`} />
              </g>
              <path className="login-owl__lash" d={`M${cx - 10} 63q10 6 20 0`} />
            </g>
          ))}

          <path className="login-owl__brow login-owl__brow--left" d="M51 41q12-6 25 1" />
          <path className="login-owl__brow login-owl__brow--right" d="M84 42q13-7 25-1" />
          <path className="login-owl__beak" d="M80 66l6.5 8.5L80 84l-6.5-9.5z" />

          {/* Raised wings: tucked away below, they rise to cover the eyes. */}
          <g className="login-owl__cover login-owl__cover--left">
            <path
              d="M45 99c-6-19 0-43 18-53 12-5 21 4 18 17-3 10-13 17-22 29z"
              fill={`url(#${wingGradient})`}
            />
            <path className="login-owl__wing-lines" d="M58 50q8 2 10 10M52 58q8 2 10 10" />
          </g>
          <g className="login-owl__cover login-owl__cover--right">
            <path
              d="M115 99c6-19 0-43-18-53-12-5-21 4-18 17 3 10 13 17 22 29z"
              fill={`url(#${wingGradient})`}
            />
            <path className="login-owl__wing-lines" d="M102 50q-8 2-10 10M108 58q-8 2-10 10" />
          </g>
        </g>
      </g>
    </svg>
  );
}
