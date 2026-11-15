import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserProfile } from './types';

/**
 * Authentication state. The access token lives only in memory (Redux), never
 * in localStorage, so injected scripts cannot read it from storage. After a
 * reload the session is restored from the httpOnly refresh cookie.
 */
export interface AuthState {
  /** 'unknown' until the first session-restore attempt finishes. */
  status: 'unknown' | 'authenticated' | 'anonymous';
  accessToken: string | null;
  user: UserProfile | null;
}

const initialState: AuthState = { status: 'unknown', accessToken: null, user: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<{ accessToken: string; user: UserProfile }>) {
      state.status = 'authenticated';
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
    },
    userUpdated(state, action: PayloadAction<UserProfile>) {
      state.user = action.payload;
    },
    loggedOut(state) {
      state.status = 'anonymous';
      state.accessToken = null;
      state.user = null;
    },
  },
});

export const { sessionStarted, userUpdated, loggedOut } = authSlice.actions;
export default authSlice.reducer;

type WithAuth = { auth: AuthState };
export const selectAuthStatus = (state: WithAuth) => state.auth.status;
export const selectCurrentUser = (state: WithAuth) => state.auth.user;
export const selectAccessToken = (state: WithAuth) => state.auth.accessToken;
