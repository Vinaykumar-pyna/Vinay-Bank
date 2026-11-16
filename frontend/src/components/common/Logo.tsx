import { useId } from 'react';
import { Link } from 'react-router';

interface LogoMarkProps {
  size?: number;
}

/** The Vinay Bank mark: a stylised "V" with a gold coin dropping into it, on the brand gradient. */
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
      <path fill="#fff" d="M15 13h8.2L32 37.6 40.8 13H49L35.4 51h-6.8L15 13Z" />
      <circle cx="32" cy="18.5" r="4.5" fill="#fbbf24" />
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
      aria-label="Vinay Bank home"
    >
      <LogoMark size={size} />
      <span>
        Vinay <span className={light ? 'text-white' : 'text-gradient'}>Bank</span>
      </span>
    </Link>
  );
}
