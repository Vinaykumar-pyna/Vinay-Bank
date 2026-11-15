import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import {
  base32Encode,
  buildOtpAuthUri,
  generateTotpSecret,
  sha256Hex,
  verifyTotp,
} from '@app/shared';
import { APP_NAME } from '../../common/constants/app.constants';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
import type { UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';

const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_PATTERN = /^[A-Z2-7]{4}-?[A-Z2-7]{4}$/;

export interface MfaSetup {
  /** Secret grouped in fours for manual entry when the QR code cannot be scanned. */
  manualEntryKey: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

function hashRecoveryCode(code: string): string {
  return sha256Hex(code.replace('-', '').toUpperCase());
}

/**
 * Two-factor authentication with TOTP (RFC 6238) and single-use recovery codes.
 * The TOTP secret is stored encrypted, and each code is accepted only once.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly users: UsersService,
    private readonly crypto: FieldEncryptionService,
  ) {}

  private aad(userId: string): string {
    return `user:${userId}:mfa`;
  }

  async beginSetup(user: UserDocument): Promise<MfaSetup> {
    if (user.mfa?.enabled) {
      throw AppException.conflict('Two-factor authentication is already enabled');
    }
    const secret = generateTotpSecret();
    await this.users.model.updateOne(
      { _id: user._id },
      {
        $set: {
          'mfa.pendingSecretEncrypted': this.crypto.encrypt(secret, this.aad(user._id.toString())),
        },
      },
    );
    const otpauthUrl = buildOtpAuthUri({ secret, account: user.email, issuer: APP_NAME });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    });
    return { manualEntryKey: secret.match(/.{1,4}/g)!.join(' '), otpauthUrl, qrCodeDataUrl };
  }

  /** Confirms setup with a code from the app; returns recovery codes (shown only once). */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.users.findByIdOrThrow(userId);
    const pending = user.mfa?.pendingSecretEncrypted;
    if (!pending) {
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'Start two-factor setup first');
    }
    const check = verifyTotp(code, this.crypto.decrypt(pending, this.aad(userId)));
    if (!check.valid) throw invalidCode();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = base32Encode(randomBytes(5)); // 40 bits -> 8 base32 characters
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    });
    await this.users.model.updateOne(
      { _id: user._id },
      {
        $set: {
          'mfa.enabled': true,
          'mfa.secretEncrypted': pending,
          'mfa.lastUsedStep': check.timeStep,
          'mfa.recoveryCodeHashes': recoveryCodes.map(hashRecoveryCode),
          'mfa.enabledAt': new Date(),
        },
        $unset: { 'mfa.pendingSecretEncrypted': 1 },
      },
    );
    return { recoveryCodes };
  }

  async disable(userId: string): Promise<void> {
    await this.users.model.updateOne(
      { _id: userId },
      { $set: { mfa: { enabled: false, recoveryCodeHashes: [] } } },
    );
  }

  /**
   * Verifies a 6-digit TOTP code or a recovery code. Both checks are atomic
   * database updates, so the same code can never succeed twice, even when two
   * requests race each other.
   */
  async verify(userId: string, rawCode: string): Promise<boolean> {
    const user = await this.users.model.findById(userId).lean();
    if (!user?.mfa?.enabled || !user.mfa.secretEncrypted) return false;
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');

    if (/^\d{6}$/.test(code)) {
      const secret = this.crypto.decrypt(user.mfa.secretEncrypted, this.aad(userId));
      const check = verifyTotp(code, secret);
      if (!check.valid || check.timeStep === undefined) return false;
      const result = await this.users.model.updateOne(
        {
          _id: userId,
          $or: [
            { 'mfa.lastUsedStep': { $lt: check.timeStep } },
            { 'mfa.lastUsedStep': { $exists: false } },
          ],
        },
        { $set: { 'mfa.lastUsedStep': check.timeStep } },
      );
      return result.modifiedCount === 1;
    }

    if (RECOVERY_CODE_PATTERN.test(code)) {
      const hash = hashRecoveryCode(code);
      const result = await this.users.model.updateOne(
        { _id: userId, 'mfa.recoveryCodeHashes': hash },
        { $pull: { 'mfa.recoveryCodeHashes': hash } },
      );
      return result.modifiedCount === 1;
    }
    return false;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    const user = await this.users.model.findById(userId).select('mfa.recoveryCodeHashes').lean();
    return user?.mfa?.recoveryCodeHashes?.length ?? 0;
  }
}

function invalidCode(): AppException {
  return new AppException(
    ErrorCode.INVALID_MFA_CODE,
    'The verification code is incorrect or has expired',
    HttpStatus.BAD_REQUEST,
  );
}
