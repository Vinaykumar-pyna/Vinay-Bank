import { QueryStatus } from '@reduxjs/toolkit/query';
import type { RootState } from './store';
import { selectApiBusy } from './selectors';

function stateWith(api: {
  queries?: Record<string, { status: QueryStatus; endpointName: string }>;
  mutations?: Record<string, { status: QueryStatus; endpointName: string }>;
}): RootState {
  return { api: { queries: {}, mutations: {}, ...api } } as unknown as RootState;
}

describe('selectApiBusy', () => {
  it('is busy while a query or a mutation the user waits for is pending', () => {
    expect(selectApiBusy(stateWith({}))).toBe(false);
    expect(
      selectApiBusy(
        stateWith({ queries: { a: { status: QueryStatus.pending, endpointName: 'getAccounts' } } }),
      ),
    ).toBe(true);
    expect(
      selectApiBusy(
        stateWith({ mutations: { m: { status: QueryStatus.pending, endpointName: 'login' } } }),
      ),
    ).toBe(true);
    expect(
      selectApiBusy(
        stateWith({ queries: { a: { status: QueryStatus.fulfilled, endpointName: 'getAccounts' } } }),
      ),
    ).toBe(false);
  });

  it('ignores background polling', () => {
    expect(
      selectApiBusy(
        stateWith({
          queries: {
            h: { status: QueryStatus.pending, endpointName: 'getHealth' },
            n: { status: QueryStatus.pending, endpointName: 'getUnreadCount' },
          },
        }),
      ),
    ).toBe(false);
  });
});
