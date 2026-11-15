import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

export enum IdempotencyStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Schema({ collection: 'idempotency_keys', timestamps: { createdAt: true, updatedAt: false } })
export class IdempotencyRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  /** Hash of the request body: the same key with a different body is rejected. */
  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: String, enum: IdempotencyStatus, required: true })
  status: IdempotencyStatus;

  @Prop({ type: MongooseSchema.Types.Mixed })
  response?: unknown;

  createdAt: Date;
}

export const IdempotencyRecordSchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });
// Keys expire after 24 hours (TTL index), like Stripe's idempotency keys.
IdempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 3600 });
