import { useGetHealthQuery } from '@/api/healthApi';

/** Live API status, also a quick end-to-end check that frontend and backend are wired up. */
export function ApiStatus() {
  const { data, isLoading, isError } = useGetHealthQuery(undefined, { pollingInterval: 30_000 });

  const state = isLoading ? 'checking' : isError ? 'offline' : 'online';
  const label = {
    checking: 'Checking system status...',
    offline: 'API unreachable',
    online: `All systems operational, API v${data?.version ?? ''}`,
  }[state];

  return (
    <span className="d-inline-flex align-items-center gap-2 small" role="status" aria-live="polite">
      <span className={`status-dot ${state}`} aria-hidden="true" />
      {label}
    </span>
  );
}
