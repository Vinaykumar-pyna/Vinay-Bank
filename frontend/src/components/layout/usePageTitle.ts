import { useEffect } from 'react';
import { useMatches } from 'react-router';

interface RouteHandle {
  title?: string;
}

/**
 * Reads `handle.title` from the deepest matching route, and keeps
 * document.title in sync (useful for history, tabs and screen readers).
 */
export function usePageTitle(): string {
  const matches = useMatches();
  const title = [...matches]
    .reverse()
    .find((match) => (match.handle as RouteHandle | undefined)?.title)?.handle as
    RouteHandle | undefined;
  const value = title?.title ?? 'ArthaBank';

  useEffect(() => {
    document.title = value === 'ArthaBank' ? 'ArthaBank | Digital Banking' : `${value} | ArthaBank`;
  }, [value]);

  return value;
}
