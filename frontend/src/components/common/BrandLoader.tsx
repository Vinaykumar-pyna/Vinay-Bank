import { useId } from 'react';

interface BrandLoaderProps {
  /** Width and height in pixels. */
  size?: number;
  className?: string;
}

/**
 * The animated Vinay Bank mark shown by every loading state: the "VB" monogram
 * draws itself on the brand tile, a gold coin drops into the V (as in the logo)
 * and a gradient arc circles the tile. The boot splash in index.html draws the same mark before the app has loaded.
 */
export function BrandLoader({ size = 72, className = '' }: BrandLoaderProps) {
  const id = useId();
  const tileId = `${id}-tile`;
  const arcId = `${id}-arc`;
  const glowId = `${id}-glow`;

  return (
    <svg
      className={`vb-loader ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3730a3" />
        </linearGradient>
        {/* Runs along the visible arc: a transparent tail into a bright head. */}
        <linearGradient id={arcId} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0.25" stopColor="#818cf8" stopOpacity="0" />
          <stop offset="0.62" stopColor="#6366f1" />
          <stop offset="0.78" stopColor="#a78bfa" />
        </linearGradient>
        <radialGradient id={glowId}>
          <stop offset="0.3" stopColor="#6366f1" stopOpacity="0.45" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="vb-loader__glow" cx="60" cy="60" r="60" fill={`url(#${glowId})`} />
      <circle className="vb-loader__track" cx="60" cy="60" r="54" />
      <g className="vb-loader__orbit">
        <circle className="vb-loader__arc" cx="60" cy="60" r="54" stroke={`url(#${arcId})`} />
        <circle className="vb-loader__spark" cx="45.1" cy="111.9" r="3" />
      </g>
      <g className="vb-loader__tile">
        <rect x="22" y="22" width="76" height="76" rx="22" fill={`url(#${tileId})`} />
        <path className="vb-loader__letter" d="M35 44 46 76 57 44" pathLength={1} />
        <path
          className="vb-loader__letter vb-loader__letter--b"
          d="M66 76V44h7a8 8 0 0 1 0 16h-7 9a8 8 0 0 1 0 16h-9"
          pathLength={1}
        />
        <circle className="vb-loader__coin" cx="46" cy="48.5" r="4.5" />
      </g>
    </svg>
  );
}
