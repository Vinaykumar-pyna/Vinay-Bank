import { baseApi } from '@/api/baseApi';
import { loggedOut, sessionStarted, userUpdated } from './authSlice';
import type {
  AuthSession,
  LoginResponse,
  MfaSetup,
  RegisterPayload,
  SessionView,
  UserProfile,
} from './types';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', data: body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        if (!data.mfaRequired)
          dispatch(sessionStarted({ accessToken: data.accessToken, user: data.user }));
      },
    }),
    loginMfa: build.mutation<LoginResponse, { mfaToken: string; code: string }>({
      query: (body) => ({ url: '/auth/login/mfa', method: 'POST', data: body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        if (!data.mfaRequired)
          dispatch(sessionStarted({ accessToken: data.accessToken, user: data.user }));
      },
    }),
    register: build.mutation<AuthSession, RegisterPayload>({
      query: (body) => ({ url: '/auth/register', method: 'POST', data: body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(sessionStarted({ accessToken: data.accessToken, user: data.user }));
      },
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(loggedOut());
        }
      },
    }),
    me: build.query<UserProfile, void>({
      query: () => '/auth/me',
      providesTags: ['Me'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(userUpdated(data));
        } catch {
          // handled by the caller
        }
      },
    }),
    changePassword: build.mutation<
      { otherSessionsSignedOut: number },
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({ url: '/auth/password', method: 'POST', data: body }),
      invalidatesTags: ['Session'],
    }),
    sessions: build.query<SessionView[], void>({
      query: () => '/auth/sessions',
      providesTags: ['Session'],
    }),
    revokeSession: build.mutation<void, string>({
      query: (id) => ({ url: `/auth/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Session'],
    }),
    revokeOtherSessions: build.mutation<{ signedOut: number }, void>({
      query: () => ({ url: '/auth/sessions/revoke-others', method: 'POST' }),
      invalidatesTags: ['Session'],
    }),
    mfaSetup: build.mutation<MfaSetup, void>({
      query: () => ({ url: '/auth/mfa/setup', method: 'POST' }),
    }),
    mfaEnable: build.mutation<{ recoveryCodes: string[] }, { code: string }>({
      query: (body) => ({ url: '/auth/mfa/enable', method: 'POST', data: body }),
      invalidatesTags: ['Me'],
    }),
    mfaDisable: build.mutation<void, { password: string; code: string }>({
      query: (body) => ({ url: '/auth/mfa/disable', method: 'POST', data: body }),
      invalidatesTags: ['Me'],
    }),
  }),
});

export const {
  useLoginMutation,
  useLoginMfaMutation,
  useRegisterMutation,
  useLogoutMutation,
  useMeQuery,
  useChangePasswordMutation,
  useSessionsQuery,
  useRevokeSessionMutation,
  useRevokeOtherSessionsMutation,
  useMfaSetupMutation,
  useMfaEnableMutation,
  useMfaDisableMutation,
} = authApi;
