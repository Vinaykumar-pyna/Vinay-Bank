import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { hmacSha256Hex, maskPhone, randomDigits, safeEqual } from '@app/shared';
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from '../../common/constants/limits';
import { DomainEvents, type OtpIssuedEvent } from '../../common/events/domain-events';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AppConfig } from '../../config/configuration';
import { MfaService } from '../auth/mfa.service';
import { OtpChallenge, type OtpChannel } from './otp-challenge.schema';

export interface IssuedChallenge {
  challengeId: string;
  channel: OtpChannel;
  expiresAt: string;
  /** Where the code went, e.g. "+91 ******3210" or "Authenticator app". */
  destination: string;
}

export interface OtpRecipient {
  id: string;
  phone: string;
  mfaEnabled: boolean;
}

/**
 * Step-up verification for sensitive actions.
 *  - Customers with two-factor authentication confirm with their authenticator (TOTP).
 *  - Everyone else gets a 6-digit one-time code by SMS (simulated: delivered to
 *    the in-app notification centre, since this project has no SMS gateway).
 */
@Injectable()
export class OtpService {
  private readonly hmacKey: Buffer;

  constructor(
    @InjectModel(OtpChallenge.name) private readonly challenges: Model<OtpChallenge>,
    private readonly mfa: MfaService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    this.hmacKey = config.get('security', { infer: true }).appHmacKey;
  }

  async issue(
    recipient: OtpRecipient,
    purpose: string,
    contextHash: string,
    describe: (code: string) => string,
  ): Promise<IssuedChallenge> {
    const channel: OtpChannel = recipient.mfaEnabled ? 'TOTP' : 'SMS';
    const id = new Types.ObjectId();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    const code = channel === 'SMS' ? randomDigits(6) : undefined;

    await this.challenges.create({
      _id: id,
      userId: recipient.id,
      purpose,
      channel,
      codeHash: code ? this.hash(id.toString(), code) : undefined,
      contextHash,
      expiresAt,
    });

    if (code) {
      this.events.emit(DomainEvents.OTP_ISSUED, {
        userId: recipient.id,
        code,
        purpose,
        message: describe(code),
      } satisfies OtpIssuedEvent);
    }
    return {
      challengeId: id.toString(),
      channel,
      expiresAt: expiresAt.toISOString(),
      destination: channel === 'TOTP' ? 'Authenticator app' : `+91 ${maskPhone(recipient.phone)}`,
    };
  }

  /** Throws unless the code is right, unexpired, unused and issued for this exact context. */
  async verify(
    challengeId: string,
    userId: string,
    code: string,
    contextHash: string,
  ): Promise<void> {
    if (!isValidObjectId(challengeId)) throw invalid('This verification request is not valid');

    // Count the attempt first (atomically) so parallel guesses cannot exceed the limit.
    const challenge = await this.challenges.findOneAndUpdate(
      {
        _id: challengeId,
        userId,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: OTP_MAX_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (!challenge) {
      const existing = await this.challenges.findOne({ _id: challengeId, userId }).lean();
      if (existing && existing.expiresAt <= new Date()) {
        throw new AppException(
          ErrorCode.OTP_EXPIRED,
          'The code has expired. Please request a new one.',
        );
      }
      throw invalid(
        'Too many incorrect attempts or the code was already used. Please start again.',
      );
    }
    if (!safeEqual(challenge.contextHash, contextHash)) {
      throw invalid('This code was issued for a different request');
    }

    const ok =
      challenge.channel === 'TOTP'
        ? await this.mfa.verify(userId, code)
        : /^\d{6}$/.test(code) &&
          safeEqual(this.hash(challenge._id.toString(), code), challenge.codeHash ?? '');
    if (!ok) {
      const left = OTP_MAX_ATTEMPTS - challenge.attempts;
      throw invalid(
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'Incorrect code. No attempts left.',
        { attemptsLeft: left },
      );
    }

    const consumed = await this.challenges.updateOne(
      { _id: challenge._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );
    if (consumed.modifiedCount !== 1) throw invalid('This code was already used');
  }

  private hash(challengeId: string, code: string): string {
    return hmacSha256Hex(this.hmacKey, `otp:${challengeId}:${code}`);
  }
}

function invalid(message: string, details?: unknown): AppException {
  return new AppException(ErrorCode.INVALID_OTP, message, HttpStatus.BAD_REQUEST, details);
}
