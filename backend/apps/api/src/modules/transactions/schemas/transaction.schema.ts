import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  Category,
  Channel,
  PaymentRail,
  TransactionStatus,
  TransactionType,
} from '../../../common/enums/banking.enums';

@Schema({ _id: false })
export class Party {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  accountNumber: string;

  @Prop()
  ifsc?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  bankName?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  customerId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Beneficiary' })
  beneficiaryId?: Types.ObjectId;
}
const PartySchema = SchemaFactory.createForClass(Party);

@Schema({ _id: false })
export class RiskSnapshot {
  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  level: string;

  @Prop({ required: true })
  decision: string;

  @Prop({ type: [String], default: [] })
  reasons: string[];

  @Prop({ required: true })
  source: string;
}
const RiskSnapshotSchema = SchemaFactory.createForClass(RiskSnapshot);

/**
 * Business-level money movement (a transfer, deposit, card payment...).
 * Its account-level effects are the postings that reference it.
 */
@Schema({ collection: 'transactions', timestamps: true })
export class Transaction {
  /** Customer-facing unique reference (like a UTR). */
  @Prop({ required: true, unique: true })
  reference: string;

  @Prop({ type: String, enum: TransactionType, required: true })
  type: TransactionType;

  @Prop({ type: String, enum: PaymentRail, required: true })
  rail: PaymentRail;

  @Prop({ type: String, enum: Channel, required: true })
  channel: Channel;

  @Prop({ type: String, enum: TransactionStatus, required: true })
  status: TransactionStatus;

  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  fee: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ type: PartySchema })
  from?: Party;

  @Prop({ type: PartySchema })
  to?: Party;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  initiatedBy: Types.ObjectId;

  @Prop({ required: true })
  initiatorRole: string;

  @Prop({ trim: true, maxlength: 140 })
  remarks?: string;

  @Prop({ type: String, enum: Category, default: Category.TRANSFER })
  category: Category;

  @Prop({ type: RiskSnapshotSchema })
  risk?: RiskSnapshot;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Approval' })
  approvalId?: Types.ObjectId;

  @Prop()
  failureReason?: string;

  /** When a deferred-settlement rail (NEFT) is expected to settle. */
  @Prop()
  settlementDueAt?: Date;

  @Prop()
  settlementBatch?: string;

  @Prop()
  completedAt?: Date;

  /** Rail- or channel-specific details (e.g. card terminal, STAN, auth code). */
  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  /** Set once the double-entry general ledger has been posted (SQL ledger). */
  @Prop({ default: false })
  ledgerPosted: boolean;

  /** Set once the reversing journal entry has been posted for a reversed transaction. */
  @Prop({ default: false })
  ledgerReversalPosted: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ 'from.accountId': 1, createdAt: -1 });
TransactionSchema.index({ 'to.accountId': 1, createdAt: -1 });
TransactionSchema.index({ initiatedBy: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, rail: 1, settlementDueAt: 1 });
TransactionSchema.index({ 'risk.level': 1, createdAt: -1 });
TransactionSchema.index({ ledgerPosted: 1, status: 1 });
// Card network: one authorization per terminal and retrieval reference number
// (a duplicate 0200 is declined with response code 94), and fast reversal lookups.
TransactionSchema.index(
  { 'metadata.terminalId': 1, 'metadata.rrn': 1 },
  { unique: true, partialFilterExpression: { rail: 'CARD', 'metadata.rrn': { $exists: true } } },
);
