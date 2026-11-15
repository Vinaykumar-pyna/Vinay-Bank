import { useId } from 'react';
import { Link } from 'react-router';

interface LogoMarkProps {
  size?: number;
}

/** The ArthaBank mark: a stylised "A" with a gold coin, on the brand gradient. */
export function LogoMark({ size = 32 }: LogoMarkProps) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3730a3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M32 13 49 51h-8.2l-3.4-8H26.6l-3.4 8H15L32 13Zm0 15.2L28.9 36h6.2L32 28.2Z"
      />
      <circle cx="48" cy="16" r="5" fill="#fbbf24" />
    </svg>
  );
}

interface LogoProps {
  to?: string;
  size?: number;
  className?: string;
  /** White wordmark for use on the brand gradient. */
  light?: boolean;
}

export function Logo({ to = '/', size = 32, className = '', light = false }: LogoProps) {
  return (
    <Link
      to={to}
      className={`brand ${light ? 'text-white' : ''} ${className}`}
      aria-label="ArthaBank home"
    >
      <LogoMark size={size} />
      <span>
        Artha<span className={light ? 'text-white' : 'text-gradient'}>Bank</span>
      </span>
    </Link>
  );
}
