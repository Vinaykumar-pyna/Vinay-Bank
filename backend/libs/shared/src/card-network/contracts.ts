/**
 * Contract between the card switch and the issuer (the core banking API).
 * The switch speaks ISO 8583 to acquirers; towards the issuer it sends these
 * plain objects over an mTLS NestJS microservice connection.
 */
export const CARD_RPC = {
  AUTHORIZE: 'card.authorize',
  REVERSE: 'card.reverse',
} as const;

export type CardOperation = 'PURCHASE' | 'CASH_WITHDRAWAL' | 'BALANCE_INQUIRY';

export interface CardAuthorizeRequest {
  operation: CardOperation;
  pan: string;
  /** YYMM, as in field 14 */
  expiry: string;
  /** Minor units (paise) */
  amount: number;
  currency: string;
  /** Hex PIN block, already translated by the switch to the issuer's zone PIN key */
  pinBlock?: string;
  stan: string;
  rrn: string;
  terminalId: string;
  merchantId: string;
  merchantName: string;
  mcc: string;
  entryMode: string;
}

export interface CardAuthorizeResponse {
  responseCode: string;
  message: string;
  authCode?: string;
  /** Paise; returned for balance inquiries and approved withdrawals */
  ledgerBalance?: number;
  availableBalance?: number;
  transactionId?: string;
}

export interface CardReverseRequest {
  rrn: string;
  terminalId: string;
  stan: string;
  amount: number;
  reason: string;
}

export interface CardReverseResponse {
  responseCode: string;
  message: string;
  transactionId?: string;
}

/** Merchant category code for ATM cash (ISO 18245). */
export const MCC_ATM = '6011';
