import { baseApi } from '@/api/baseApi';
import type { OtpChallenge } from '@/features/banking/types';
import type {
  CardControls,
  CardLimits,
  DebitCard,
  RevealedCard,
  SimulatorOutcome,
  SimulatorRequest,
  TerminalProfile,
  WireExchange,
} from './types';

/** Debit card self-service plus the public card network simulator. */
export const cardsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCards: build.query<DebitCard[], void>({
      query: () => '/cards',
      providesTags: ['Card'],
    }),
    issueCard: build.mutation<DebitCard, { accountId: string }>({
      query: (data) => ({ url: '/cards', method: 'POST', data }),
      invalidatesTags: ['Card'],
    }),
    requestCardOtp: build.mutation<OtpChallenge, { id: string; purpose: 'REVEAL' | 'PIN' }>({
      query: ({ id, purpose }) => ({ url: `/cards/${id}/otp`, method: 'POST', data: { purpose } }),
    }),
    revealCard: build.mutation<RevealedCard, { id: string; challengeId: string; otp: string }>({
      query: ({ id, ...data }) => ({ url: `/cards/${id}/reveal`, method: 'POST', data }),
    }),
    setCardPin: build.mutation<
      DebitCard,
      { id: string; challengeId: string; otp: string; pin: string }
    >({
      query: ({ id, ...data }) => ({ url: `/cards/${id}/pin`, method: 'POST', data }),
      invalidatesTags: ['Card'],
    }),
    updateCardSettings: build.mutation<
      DebitCard,
      { id: string; controls?: Partial<CardControls>; limits?: Partial<CardLimits> }
    >({
      query: ({ id, ...data }) => ({ url: `/cards/${id}/settings`, method: 'PATCH', data }),
      invalidatesTags: ['Card'],
    }),
    setCardBlocked: build.mutation<DebitCard, { id: string; blocked: boolean }>({
      query: ({ id, blocked }) => ({
        url: `/cards/${id}/${blocked ? 'block' : 'unblock'}`,
        method: 'POST',
      }),
      invalidatesTags: ['Card'],
    }),
    hotlistCard: build.mutation<DebitCard, { id: string; reason: 'LOST' | 'STOLEN' | 'DAMAGED' }>({
      query: ({ id, reason }) => ({
        url: `/cards/${id}/hotlist`,
        method: 'POST',
        data: { reason },
      }),
      invalidatesTags: ['Card'],
    }),

    getTerminals: build.query<TerminalProfile[], void>({
      query: () => '/simulator/terminals',
      keepUnusedDataFor: 3600,
    }),
    getDemoCard: build.query<
      { pan: string; expiry: string; cardholderName: string; last4: string },
      void
    >({
      query: () => '/simulator/demo-card',
    }),
    runCardNetwork: build.mutation<
      { outcome: SimulatorOutcome; exchange: WireExchange },
      SimulatorRequest
    >({
      query: (data) => ({ url: '/simulator/card-network', method: 'POST', data }),
      // A signed-in customer sees balances and card usage refresh immediately.
      invalidatesTags: ['Account', 'Transaction', 'Card'],
    }),
  }),
});

export const {
  useGetCardsQuery,
  useIssueCardMutation,
  useRequestCardOtpMutation,
  useRevealCardMutation,
  useSetCardPinMutation,
  useUpdateCardSettingsMutation,
  useSetCardBlockedMutation,
  useHotlistCardMutation,
  useGetTerminalsQuery,
  useLazyGetDemoCardQuery,
  useRunCardNetworkMutation,
} = cardsApi;
