import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum ApprovalType {
  HIGH_VALUE_TRANSFER = 'HIGH_VALUE_TRANSFER',
  ACCOUNT_OPENING = 'ACCOUNT_OPENING',
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Maker-checker (four-eyes) request: one person initiates (the maker), a
 * different, more senior person approves or rejects (the checker).
 */
@Schema({ collection: 'approvals', timestamps: true })
export class Approval {
  @Prop({ type: String, enum: ApprovalType, required: true })
  type: ApprovalType;

  @Prop({ type: String, enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Prop({ required: true })
  entityType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ type: Number })
  amount?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  customerId?: Types.ObjectId;

  @Prop()
  customerName?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  makerId: Types.ObjectId;

  @Prop({ required: true })
  makerRole: string;

  @Prop({ required: true })
  makerName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  checkerId?: Types.ObjectId;

  @Prop()
  checkerName?: string;

  @Prop()
  decidedAt?: Date;

  @Prop({ trim: true, maxlength: 300 })
  remarks?: string;

  @Prop()
  branchCode?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type ApprovalDocument = HydratedDocument<Approval>;
export const ApprovalSchema = SchemaFactory.createForClass(Approval);
ApprovalSchema.index({ status: 1, createdAt: -1 });
ApprovalSchema.index({ entityType: 1, entityId: 1 });
ApprovalSchema.index({ makerId: 1, createdAt: -1 });
