import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  /** Temporarily blocked by the customer; can be unblocked */
  BLOCKED = 'BLOCKED',
  /** Reported lost, stolen or damaged; permanent */
  HOTLISTED = 'HOTLISTED',
}

export enum HotlistReason {
  LOST = 'LOST',
  STOLEN = 'STOLEN',
  DAMAGED = 'DAMAGED',
}

const RUPEE = 100;

@Schema({ _id: false })
export class CardControls {
  @Prop({ default: true })
  atm: boolean;

  @Prop({ default: true })
  pos: boolean;

  @Prop({ default: true })
  ecommerce: boolean;

  @Prop({ default: true })
  contactless: boolean;

  @Prop({ default: false })
  international: boolean;
}

@Schema({ _id: false })
export class CardLimits {
  @Prop({ type: Number, default: 25_000 * RUPEE })
  atmDaily: number;

  @Prop({ type: Number, default: 1_00_000 * RUPEE })
  posDaily: number;
}

/** Today's spend per channel, reset when `date` (IST, YYYYMMDD) changes. */
@Schema({ _id: false })
export class CardUsage {
  @Prop({ default: '' })
  date: string;

  @Prop({ type: Number, default: 0 })
  atm: number;

  @Prop({ type: Number, default: 0 })
  pos: number;
}

/**
 * A debit card. The PAN is stored only encrypted (AES-256-GCM) plus a keyed
 * blind index for lookups; the CVV is never stored (derived on demand from a
 * card verification key); the PIN is never stored, only a keyed verification value.
 */
@Schema({ collection: 'cards', timestamps: true })
export class Card {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  panEncrypted: string;

  @Prop({ required: true, unique: true })
  panIndex: string;

  @Prop({ required: true })
  bin: string;

  @Prop({ required: true })
  last4: string;

  /** YYMM, as carried in ISO 8583 field 14 */
  @Prop({ required: true })
  expiry: string;

  @Prop({ required: true })
  cardholderName: string;

  @Prop({ default: 'RUPAY' })
  network: string;

  @Prop({ default: 'Platinum Debit' })
  variant: string;

  @Prop({ type: String, enum: CardStatus, default: CardStatus.ACTIVE })
  status: CardStatus;

  @Prop()
  statusReason?: string;

  @Prop({ type: String, enum: HotlistReason })
  hotlistReason?: HotlistReason;

  /** HMAC(PVK, PAN|PIN): verifies a PIN without storing it */
  @Prop()
  pinVerificationValue?: string;

  /** Consecutive wrong PINs; three locks PIN use until a new PIN is set */
  @Prop({ type: Number, default: 0 })
  pinTries: number;

  @Prop()
  pinChangedAt?: Date;

  @Prop({ type: SchemaFactory.createForClass(CardControls), default: () => ({}) })
  controls: CardControls;

  @Prop({ type: SchemaFactory.createForClass(CardLimits), default: () => ({}) })
  limits: CardLimits;

  @Prop({ type: SchemaFactory.createForClass(CardUsage), default: () => ({}) })
  usage: CardUsage;

  createdAt: Date;
  updatedAt: Date;
}

export type CardDocument = HydratedDocument<Card>;
export const CardSchema = SchemaFactory.createForClass(Card);
CardSchema.index({ accountId: 1, status: 1 });

export const CARD_LIMIT_CAPS = {
  atmDaily: 50_000 * RUPEE,
  posDaily: 2_00_000 * RUPEE,
} as const;

export const MAX_PIN_TRIES = 3;
