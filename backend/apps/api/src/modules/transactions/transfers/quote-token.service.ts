import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canonicalJson, hmacSha256, safeEqual, sha256Hex } from '@app/shared';
import { QUOTE_TTL_SECONDS } from '../../../common/constants/limits';
import type { Category, PaymentRail } from '../../../common/enums/banking.enums';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AppConfig } from '../../../config/configuration';
import type { RiskAssessment } from '../../risk/risk.types';

export interface QuotePayload {
  v: 1;
  jti: string;
  sub: string;
  exp: number;
  fromAccountId: string;
  payee: { kind: 'OWN' | 'BENEFICIARY'; id: string };
  rail: PaymentRail;
  amount: number;
  fee: number;
  category: Category;
  remarks?: string;
  approvalRequired: boolean;
  risk: Pick<RiskAssessment, 'score' | 'level' | 'decision' | 'reasons' | 'source'>;
  otp?: { challengeId: string; channel: 'SMS' | 'TOTP' };
}

export type UnsignedQuote = Omit<QuotePayload, 'v' | 'jti' | 'exp' | 'otp'>;

/**
 * Stateless, tamper-proof transfer quotes: "base64url(payload).HMAC-SHA256".
 * What the customer reviewed (amount, fee, payee, risk outcome) is exactly what
 * gets executed; changing any byte invalidates the signature.
 */
@Injectable()
export class QuoteTokenService {
  private readonly key: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.key = config.get('security', { infer: true }).appHmacKey;
  }

  /** Fills in id and expiry. The OTP binds to `contextHash(payload)`, computed before the OTP is attached. */
  prepare(input: UnsignedQuote): QuotePayload {
    return {
      v: 1,
      jti: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS,
      ...input,
    };
  }

  /** Hash of everything except the OTP reference: what the one-time code approves. */
  contextHash(payload: QuotePayload): string {
    const { otp: _otp, ...rest } = payload;
    return sha256Hex(canonicalJson(rest));
  }

  sign(payload: QuotePayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.signature(body)}`;
  }

  verify(token: string, userId: string): QuotePayload {
    const [body, signature] = token.split('.');
    if (!body || !signature || !safeEqual(signature, this.signature(body))) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'This transfer request is invalid. Please start again.',
      );
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QuotePayload;
    if (payload.v !== 1 || payload.sub !== userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'This transfer request belongs to someone else',
        HttpStatus.FORBIDDEN,
      );
    }
    if (payload.exp * 1000 < Date.now()) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_STATE,
        'This transfer review has expired. Please review the transfer again.',
      );
    }
    return payload;
  }

  private signature(body: string): string {
    return hmacSha256(this.key, `transfer-quote.${body}`).toString('base64url');
  }
}
