import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum NotificationType {
  TRANSACTION = 'TRANSACTION',
  SECURITY = 'SECURITY',
  OTP = 'OTP',
  APPROVAL = 'APPROVAL',
  ACCOUNT = 'ACCOUNT',
  SYSTEM = 'SYSTEM',
}

@Schema({ collection: 'notifications', timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  /** In-app route to open when the notification is clicked. */
  @Prop()
  link?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  data?: Record<string, unknown>;

  @Prop({ default: false })
  read: boolean;

  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
// Notifications older than 90 days are removed automatically.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
