import { QueryStatus } from '@reduxjs/toolkit/query';
import type { RootState } from './store';

/** Requests that refresh quietly in the background (polling); they never show a loader. */
const BACKGROUND_ENDPOINTS = new Set(['getHealth', 'getUnreadCount']);

/** True while any API request the user is waiting for is in flight. */
export function selectApiBusy(state: RootState): boolean {
  const { queries, mutations } = state.api;
  return (
    Object.values(queries).some(
      (query) =>
        query?.status === QueryStatus.pending && !BACKGROUND_ENDPOINTS.has(query.endpointName),
    ) || Object.values(mutations).some((mutation) => mutation?.status === QueryStatus.pending)
  );
}
