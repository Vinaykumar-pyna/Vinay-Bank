import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum BeneficiaryStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

@Schema({ collection: 'beneficiaries', timestamps: true })
export class Beneficiary {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  nickname?: string;

  @Prop({ required: true })
  accountNumber: string;

  @Prop({ required: true, uppercase: true })
  ifsc: string;

  @Prop({ required: true })
  bankName: string;

  @Prop()
  branchName?: string;

  /** True when the payee banks with Vinay Bank (instant internal transfer). */
  @Prop({ default: false })
  isInternal: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account' })
  internalAccountId?: Types.ObjectId;

  /** Until this moment, transfers to this payee are capped (anti-fraud cooling period). */
  @Prop({ required: true })
  coolingUntil: Date;

  @Prop({ type: String, enum: BeneficiaryStatus, default: BeneficiaryStatus.ACTIVE })
  status: BeneficiaryStatus;

  createdAt: Date;
  updatedAt: Date;
}

export type BeneficiaryDocument = HydratedDocument<Beneficiary>;
export const BeneficiarySchema = SchemaFactory.createForClass(Beneficiary);
BeneficiarySchema.index(
  { ownerId: 1, accountNumber: 1, ifsc: 1 },
  { unique: true, partialFilterExpression: { status: BeneficiaryStatus.ACTIVE } },
);
BeneficiarySchema.index({ ownerId: 1, status: 1, name: 1 });
