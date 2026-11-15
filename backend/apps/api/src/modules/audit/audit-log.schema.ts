import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

/**
 * Append-only, hash-chained audit record.
 *   hash = SHA-256(prevHash + canonicalJson(record fields))
 * Changing, deleting or reordering any record breaks every hash after it,
 * which the verification job detects.
 */
@Schema({ collection: 'audit_logs', versionKey: false })
export class AuditLog {
  @Prop({ required: true, unique: true })
  seq: number;

  @Prop({ required: true })
  at: Date;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true, enum: ['SUCCESS', 'FAILURE'] })
  outcome: AuditOutcome;

  @Prop()
  actorId?: string;

  @Prop()
  actorRole?: string;

  /** Human-readable actor (email or "system"), for display only. */
  @Prop()
  actorLabel?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  requestId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details?: Record<string, unknown>;

  @Prop({ required: true })
  prevHash: string;

  @Prop({ required: true })
  hash: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ actorId: 1, at: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
AuditLogSchema.index({ action: 1, at: -1 });
AuditLogSchema.index({ at: -1 });
