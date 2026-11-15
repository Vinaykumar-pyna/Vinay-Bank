import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * One document per signed-in device. Only the SHA-256 hash of the refresh
 * token is stored, so a database leak does not reveal usable tokens.
 */
@Schema({ collection: 'sessions', timestamps: true })
export class Session {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  tokenHash: string;

  /** Hash of the token that was just rotated out, accepted briefly for parallel requests. */
  @Prop()
  previousTokenHash?: string;

  @Prop()
  rotatedAt?: Date;

  @Prop()
  userAgent?: string;

  @Prop()
  deviceLabel?: string;

  @Prop()
  ip?: string;

  @Prop({ required: true })
  lastUsedAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokeReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);

// TTL index: MongoDB deletes sessions automatically once expiresAt has passed.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1, revokedAt: 1, lastUsedAt: -1 });
