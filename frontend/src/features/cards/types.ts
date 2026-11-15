export type CardStatus = 'ACTIVE' | 'BLOCKED' | 'HOTLISTED';

export interface CardControls {
  atm: boolean;
  pos: boolean;
  ecommerce: boolean;
  contactless: boolean;
  international: boolean;
}

export interface CardLimits {
  atmDaily: number;
  posDaily: number;
}

export interface DebitCard {
  id: string;
  accountId: string;
  maskedPan: string;
  last4: string;
  network: string;
  variant: string;
  cardholderName: string;
  /** MM/YY */
  expiry: string;
  status: CardStatus;
  statusReason?: string;
  hotlistReason?: string;
  pinSet: boolean;
  pinLocked: boolean;
  controls: CardControls;
  limits: CardLimits;
  usedToday: { atm: number; pos: number };
  createdAt: string;
}

export interface RevealedCard {
  pan: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

/** Same caps as the API (paise). */
export const CARD_LIMIT_CAPS: CardLimits = { atmDaily: 50_000 * 100, posDaily: 2_00_000 * 100 };

/** Mirrors the API rule: no repeated digit (1111) and no straight run (1234, 9876). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const steps = [...pin].slice(1).map((d, i) => Number(d) - Number(pin[i]));
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

// ---------------------------------------------------------------------------
// Card network simulator
// ---------------------------------------------------------------------------

export type SimulatorOperation = 'ECHO' | 'BALANCE' | 'WITHDRAWAL' | 'PURCHASE' | 'REVERSAL';

export interface TerminalProfile {
  type: 'ATM' | 'POS';
  terminalId: string;
  merchantId: string;
  label: string;
  mcc: string;
}

export interface WireField {
  field: number;
  name: string;
  value: string;
}

export interface WireMessage {
  mti: string;
  mtiName: string;
  bitmap: string;
  fields: WireField[];
  hex: string;
  bytes: number;
}

export interface WireExchange {
  request: WireMessage;
  response: WireMessage;
  roundTripMs: number;
  tls: { protocol: string | null; cipher: string; serverCertificate: string };
}

export interface SimulatorOutcome {
  operation: SimulatorOperation;
  terminal: string;
  approved: boolean;
  responseCode: string;
  message: string;
  authCode?: string;
  amount?: number;
  availableBalance?: number;
  ledgerBalance?: number;
  stan: string;
  rrn?: string;
  transmittedAt: string;
}

export interface SimulatorRequest {
  operation: SimulatorOperation;
  terminal: 'ATM' | 'POS';
  pan?: string;
  expiry?: string;
  pin?: string;
  amount?: number;
  original?: {
    rrn: string;
    stan: string;
    transmittedAt: string;
    operation: 'WITHDRAWAL' | 'PURCHASE';
    amount: number;
  };
}
