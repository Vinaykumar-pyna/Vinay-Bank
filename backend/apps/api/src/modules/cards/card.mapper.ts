import type { Types } from 'mongoose';
import { istDateStamp } from '@app/shared';
import type { Card, CardControls, CardLimits } from './schemas/card.schema';

export interface CardView {
  id: string;
  accountId: string;
  maskedPan: string;
  last4: string;
  network: string;
  variant: string;
  cardholderName: string;
  /** MM/YY */
  expiry: string;
  status: Card['status'];
  statusReason?: string;
  hotlistReason?: string;
  pinSet: boolean;
  pinLocked: boolean;
  controls: CardControls;
  limits: CardLimits;
  usedToday: { atm: number; pos: number };
  createdAt: string;
}

export function formatExpiry(yymm: string): string {
  return `${yymm.slice(2, 4)}/${yymm.slice(0, 2)}`;
}

export function toCardView(card: Card & { _id: Types.ObjectId }, maxPinTries: number): CardView {
  const today = card.usage?.date === istDateStamp();
  return {
    id: card._id.toString(),
    accountId: card.accountId.toString(),
    maskedPan: `${card.bin.slice(0, 4)} ${card.bin.slice(4)}XX XXXX ${card.last4}`,
    last4: card.last4,
    network: card.network,
    variant: card.variant,
    cardholderName: card.cardholderName,
    expiry: formatExpiry(card.expiry),
    status: card.status,
    statusReason: card.statusReason,
    hotlistReason: card.hotlistReason,
    pinSet: Boolean(card.pinVerificationValue),
    pinLocked: card.pinTries >= maxPinTries,
    controls: {
      atm: card.controls.atm,
      pos: card.controls.pos,
      ecommerce: card.controls.ecommerce,
      contactless: card.controls.contactless,
      international: card.controls.international,
    },
    limits: { atmDaily: card.limits.atmDaily, posDaily: card.limits.posDaily },
    usedToday: { atm: today ? card.usage.atm : 0, pos: today ? card.usage.pos : 0 },
    createdAt: card.createdAt.toISOString(),
  };
}
