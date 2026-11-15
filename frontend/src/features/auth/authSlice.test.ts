import reducer, { loggedOut, sessionStarted, userUpdated, type AuthState } from './authSlice';
import type { UserProfile } from './types';

const user = {
  id: 'u1',
  role: 'CUSTOMER',
  email: 'priya@example.com',
  firstName: 'Priya',
  lastName: 'Sharma',
  fullName: 'Priya Sharma',
  mfaEnabled: false,
} as UserProfile;

describe('authSlice', () => {
  it('starts in the unknown state until the session restore attempt finishes', () => {
    expect(reducer(undefined, { type: '@@init' })).toEqual({
      status: 'unknown',
      accessToken: null,
      user: null,
    });
  });

  it('stores the session on sign-in and clears it on sign-out', () => {
    const signedIn = reducer(undefined, sessionStarted({ accessToken: 'jwt', user }));
    expect(signedIn).toMatchObject({ status: 'authenticated', accessToken: 'jwt', user });

    const signedOut = reducer(signedIn, loggedOut());
    expect(signedOut).toEqual<AuthState>({ status: 'anonymous', accessToken: null, user: null });
  });

  it('updates the profile without touching the token', () => {
    const state = reducer(undefined, sessionStarted({ accessToken: 'jwt', user }));
    const next = reducer(state, userUpdated({ ...user, mfaEnabled: true }));
    expect(next.accessToken).toBe('jwt');
    expect(next.user?.mfaEnabled).toBe(true);
  });
});
