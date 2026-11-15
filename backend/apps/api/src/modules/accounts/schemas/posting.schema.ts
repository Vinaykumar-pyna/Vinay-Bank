import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Category, Channel, PostingDirection } from '../../../common/enums/banking.enums';

/**
 * One line on an account statement. Every balance change creates a posting in
 * the same database transaction, so `balanceAfter` always forms an exact running
 * balance and the account balance can be reconciled from its postings.
 */
@Schema({ collection: 'postings', timestamps: { createdAt: true, updatedAt: false } })
export class Posting {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Transaction', required: true })
  transactionId: Types.ObjectId;

  @Prop({ required: true })
  reference: string;

  @Prop({ type: String, enum: PostingDirection, required: true })
  direction: PostingDirection;

  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @Prop({ type: Number, required: true })
  balanceAfter: number;

  @Prop({ required: true })
  narration: string;

  @Prop()
  counterpartyName?: string;

  @Prop()
  counterpartyAccount?: string;

  @Prop({ type: String, enum: Category, default: Category.OTHER })
  category: Category;

  @Prop({ type: String, enum: Channel, required: true })
  channel: Channel;

  /** Transfers between a customer's own accounts are excluded from income/spend analytics. */
  @Prop({ default: false })
  selfTransfer: boolean;

  createdAt: Date;
}

export type PostingDocument = HydratedDocument<Posting>;
export const PostingSchema = SchemaFactory.createForClass(Posting);
PostingSchema.index({ accountId: 1, createdAt: -1 });
PostingSchema.index({ transactionId: 1 });
