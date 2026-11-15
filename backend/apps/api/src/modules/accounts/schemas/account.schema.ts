import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { AccountStatus, AccountType } from '../../../common/enums/banking.enums';

/**
 * A deposit account. Balances are integer paise.
 *   ledgerBalance  money actually in the account (sum of postings)
 *   holdAmount     earmarked for transfers awaiting approval (a lien)
 *   available      = ledgerBalance - holdAmount (what the customer can spend)
 */
@Schema({ collection: 'accounts', timestamps: true })
export class Account {
  @Prop({ required: true, unique: true })
  accountNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, enum: AccountType, required: true })
  type: AccountType;

  @Prop({ type: String, enum: AccountStatus, required: true })
  status: AccountStatus;

  @Prop({ required: true })
  branchCode: string;

  @Prop({ required: true })
  ifsc: string;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ type: Number, default: 0 })
  ledgerBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  holdAmount: number;

  @Prop({ type: Number, required: true })
  dailyTransferLimit: number;

  /** Annual interest rate in basis points (300 = 3.00%). */
  @Prop({ type: Number, default: 0 })
  interestRateBps: number;

  @Prop({ trim: true, maxlength: 40 })
  nickname?: string;

  @Prop()
  openedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop({ trim: true })
  statusReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type AccountDocument = HydratedDocument<Account>;
export const AccountSchema = SchemaFactory.createForClass(Account);
AccountSchema.index({ customerId: 1, status: 1 });
AccountSchema.index({ status: 1, createdAt: -1 });
