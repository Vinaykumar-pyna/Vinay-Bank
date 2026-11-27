import { useEffect } from 'react';
import { holdBootSplash } from '@/lib/bootSplash';
import { BrandLoader } from './BrandLoader';

interface LoaderProps {
  /** What is loading, announced to screen readers and shown under the mark. */
  label?: string;
}

interface PageLoaderProps extends LoaderProps {
  /** Smaller, for dialogs and form sections instead of a whole page area. */
  compact?: boolean;
}

function LoaderLabel({ label }: { label: string }) {
  return (
    <div className="vb-loader-label">
      {label}
      <span className="vb-loader-dots" aria-hidden="true" />
    </div>
  );
}

/** Loading state inside a page or card while its data is fetched. */
export function PageLoader({ label = 'Loading', compact = false }: PageLoaderProps) {
  return (
    <div
      className={`page-loader ${compact ? 'page-loader--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <BrandLoader size={compact ? 60 : 76} />
        <LoaderLabel label={label} />
      </div>
    </div>
  );
}

interface FullScreenLoaderProps extends LoaderProps {
  /** Translucent layer over the current page (page changes) instead of a solid splash. */
  overlay?: boolean;
  /** Plays the fade-out animation before the overlay is removed. */
  leaving?: boolean;
}

/**
 * Full-screen loading screen: the splash while the app starts (router loading
 * its first page, session being restored) and the overlay during slow page
 * changes. While the boot splash from index.html is still up, it simply keeps
 * that one on screen, so the start-up animation never restarts.
 */
export function FullScreenLoader({
  label = 'Loading',
  overlay = false,
  leaving = false,
}: FullScreenLoaderProps) {
  useEffect(() => (overlay ? undefined : holdBootSplash(label)), [overlay, label]);

  return (
    <div
      className={`vb-splash ${overlay ? 'vb-splash--overlay' : ''} ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="vb-splash__content">
        <BrandLoader size={overlay ? 88 : 104} />
        <div className="vb-splash__brand" aria-hidden="true">
          Vinay <span className="text-gradient">Bank</span>
        </div>
        <LoaderLabel label={label} />
      </div>
    </div>
  );
}
