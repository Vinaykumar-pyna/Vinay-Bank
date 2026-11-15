import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum KycStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

@Schema({ _id: false })
export class Address {
  @Prop({ required: true, trim: true })
  line1: string;

  @Prop({ trim: true })
  line2?: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  state: string;

  @Prop({ required: true })
  pincode: string;
}
const AddressSchema = SchemaFactory.createForClass(Address);

/**
 * KYC data. The PAN is stored encrypted (AES-256-GCM) plus a masked copy for
 * display and a blind index for uniqueness checks. Aadhaar numbers are never
 * stored: UIDAI rules require a dedicated Aadhaar Data Vault for that.
 */
@Schema({ _id: false })
export class Kyc {
  @Prop({ type: String, enum: KycStatus, default: KycStatus.PENDING })
  status: KycStatus;

  @Prop()
  panEncrypted?: string;

  @Prop()
  panMasked?: string;

  @Prop()
  panBlindIndex?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ trim: true })
  remarks?: string;
}
const KycSchema = SchemaFactory.createForClass(Kyc);

@Schema({ _id: false })
export class MfaSettings {
  @Prop({ default: false })
  enabled: boolean;

  /** Encrypted TOTP secret (base32). */
  @Prop()
  secretEncrypted?: string;

  /** Secret generated during setup, promoted to `secretEncrypted` once a code is confirmed. */
  @Prop()
  pendingSecretEncrypted?: string;

  /** Last accepted TOTP time step: a code can never be used twice (replay protection). */
  @Prop()
  lastUsedStep?: number;

  /** SHA-256 hashes of single-use recovery codes. */
  @Prop({ type: [String], default: [] })
  recoveryCodeHashes: string[];

  @Prop()
  enabledAt?: Date;
}
const MfaSettingsSchema = SchemaFactory.createForClass(MfaSettings);

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, enum: Role, required: true })
  role: Role;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, unique: true })
  phone: string;

  /** bcrypt hash; excluded from queries unless explicitly selected. */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ type: AddressSchema })
  address?: Address;

  /** Customer Information File number, assigned to customers. */
  @Prop({ unique: true, sparse: true })
  customerId?: string;

  /** Assigned to staff users. */
  @Prop({ unique: true, sparse: true })
  employeeId?: string;

  @Prop()
  branchCode?: string;

  @Prop({ type: KycSchema, default: () => ({}) })
  kyc: Kyc;

  @Prop({ type: MfaSettingsSchema, default: () => ({}) })
  mfa: MfaSettings;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockUntil?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop()
  passwordChangedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { 'kyc.panBlindIndex': 1 },
  { unique: true, partialFilterExpression: { 'kyc.panBlindIndex': { $type: 'string' } } },
);
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({ 'kyc.status': 1, createdAt: -1 });
