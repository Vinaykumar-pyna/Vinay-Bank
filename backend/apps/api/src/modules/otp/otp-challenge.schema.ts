import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type OtpChannel = 'SMS' | 'TOTP';

@Schema({ collection: 'otp_challenges', timestamps: { createdAt: true, updatedAt: false } })
export class OtpChallenge {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true, enum: ['SMS', 'TOTP'] })
  channel: OtpChannel;

  /** HMAC of the code; the code itself is never stored. Absent for TOTP challenges. */
  @Prop()
  codeHash?: string;

  /** Hash of what is being approved (e.g. the transfer quote): the OTP cannot be reused for anything else. */
  @Prop({ required: true })
  contextHash: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  consumedAt?: Date;

  createdAt: Date;
}

export type OtpChallengeDocument = HydratedDocument<OtpChallenge>;
export const OtpChallengeSchema = SchemaFactory.createForClass(OtpChallenge);
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
OtpChallengeSchema.index({ userId: 1, createdAt: -1 });
