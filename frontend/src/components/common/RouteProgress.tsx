import { useNavigation } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectApiBusy } from '@/app/selectors';
import { useDelayedFlag, usePresence } from '@/hooks/useDelayedFlag';
import { FullScreenLoader } from './PageLoader';

/**
 * Global loading feedback:
 *  - a slim brand-coloured bar at the top of the window while a page is
 *    loading or data is being fetched (only if it takes more than a moment),
 *  - the full VB loading screen over the current page when opening a page
 *    takes longer than about half a second.
 * Pages still show their own loader (or skeletons) while their data loads.
 */
export function RouteProgress() {
  const navigation = useNavigation();
  const navigating = navigation.state !== 'idle';
  const apiBusy = useAppSelector(selectApiBusy);

  const showBar = useDelayedFlag(navigating || apiBusy, 250, 400);
  const showOverlay = useDelayedFlag(navigating, 450, 500);
  const overlay = usePresence(showOverlay, 250);

  return (
    <>
      <div className={`vb-progress ${showBar ? 'is-active' : ''}`} aria-hidden="true" />
      {overlay.mounted && <FullScreenLoader overlay leaving={overlay.leaving} label="Loading page" />}
    </>
  );
}
