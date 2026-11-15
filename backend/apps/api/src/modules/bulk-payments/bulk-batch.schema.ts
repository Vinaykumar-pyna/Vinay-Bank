import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** One accepted pain.001 file. The (customer, message ID) pair is unique, so a file cannot be paid twice. */
@Schema({ collection: 'bulk_batches', timestamps: true })
export class BulkBatch {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  fileHash: string;

  @Prop()
  initiatingParty?: string;

  @Prop({ type: Number, required: true })
  paymentCount: number;

  @Prop({ type: Number, required: true })
  totalAmount: number;

  @Prop({ type: Number, default: 0 })
  internalCount: number;

  @Prop({ type: Number, default: 0 })
  neftCount: number;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Transaction', default: [] })
  transactionIds: Types.ObjectId[];

  createdAt: Date;
  updatedAt: Date;
}

export type BulkBatchDocument = HydratedDocument<BulkBatch>;
export const BulkBatchSchema = SchemaFactory.createForClass(BulkBatch);
BulkBatchSchema.index({ customerId: 1, messageId: 1 }, { unique: true });
BulkBatchSchema.index({ customerId: 1, createdAt: -1 });
