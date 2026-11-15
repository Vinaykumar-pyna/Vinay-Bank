import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { describeUserAgent, randomToken, safeEqual, sha256Hex } from '@app/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { RequestContext } from '../../common/types/auth.types';
import type { AppConfig } from '../../config/configuration';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { Session, SessionDocument } from './session.schema';

/** Refresh token format: "<sessionId>.<256-bit random secret>". */
const REFRESH_TOKEN_PATTERN = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/;
/** Two tabs refreshing at the same moment must not trip reuse detection. */
const ROTATION_GRACE_MS = 30_000;

export type RevokeReason =
  | 'LOGOUT'
  | 'USER_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'REUSE_DETECTED'
  | 'USER_DISABLED'
  | 'MFA_CHANGED';

export interface RotationResult {
  session: SessionDocument;
  /** New refresh token; undefined when a parallel request already rotated it (grace window). */
  refreshToken?: string;
}

export interface SessionView {
  id: string;
  deviceLabel: string;
  ip?: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

@Injectable()
export class SessionsService {
  private readonly ttlMs: number;

  constructor(
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttlMs = config.get('auth', { infer: true }).refreshTtlDays * 86_400_000;
  }

  static parseRefreshToken(raw: string | undefined): { sessionId: string; secret: string } | null {
    const match = REFRESH_TOKEN_PATTERN.exec(raw ?? '');
    return match ? { sessionId: match[1], secret: match[2] } : null;
  }

  async create(userId: string, ctx: RequestContext) {
    const secret = randomToken(32);
    const now = new Date();
    const session = await this.sessions.create({
      userId,
      tokenHash: sha256Hex(secret),
      userAgent: ctx.userAgent,
      deviceLabel: describeUserAgent(ctx.userAgent),
      ip: ctx.ip,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    });
    return { session, refreshToken: `${session.id}.${secret}` };
  }

  /**
   * Refresh-token rotation with reuse detection (OAuth 2.0 Security BCP):
   * every refresh issues a new token and invalidates the old one. If an old
   * token is ever presented again, someone has a copy (it was probably stolen),
   * so the whole session is revoked.
   */
  async rotate(rawToken: string, ctx: RequestContext): Promise<RotationResult> {
    const parsed = SessionsService.parseRefreshToken(rawToken);
    if (!parsed) throw sessionEnded();

    const session = await this.sessions.findById(parsed.sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw sessionEnded();

    const presentedHash = sha256Hex(parsed.secret);
    const isCurrent = safeEqual(presentedHash, session.tokenHash);
    const isJustRotated =
      !!session.previousTokenHash &&
      !!session.rotatedAt &&
      Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS &&
      safeEqual(presentedHash, session.previousTokenHash);

    if (!isCurrent && !isJustRotated) {
      await this.revoke(session._id.toString(), 'REUSE_DETECTED');
      await this.audit.record({
        action: AuditAction.AUTH_TOKEN_REUSE_DETECTED,
        outcome: 'FAILURE',
        actor: { id: session.userId.toString() },
        entity: { type: 'Session', id: session.id },
        context: ctx,
      });
      throw AppException.unauthorized(
        'For your security this session was signed out. Please sign in again.',
        ErrorCode.SESSION_REVOKED,
      );
    }

    if (isJustRotated) {
      // A parallel request already rotated the token; the browser holds the new cookie.
      return { session };
    }

    const newSecret = randomToken(32);
    const now = new Date();
    const rotated = await this.sessions.findOneAndUpdate(
      // Optimistic concurrency: only rotate from the exact state we validated.
      { _id: session._id, tokenHash: presentedHash, revokedAt: null },
      {
        $set: {
          tokenHash: sha256Hex(newSecret),
          previousTokenHash: presentedHash,
          rotatedAt: now,
          lastUsedAt: now,
          ip: ctx.ip,
          expiresAt: new Date(now.getTime() + this.ttlMs),
        },
      },
      { new: true },
    );
    if (!rotated) return { session }; // lost a race with a parallel refresh
    return { session: rotated, refreshToken: `${rotated.id}.${newSecret}` };
  }

  async findById(sessionId: string) {
    return isValidObjectId(sessionId) ? this.sessions.findById(sessionId) : null;
  }

  /** Checked on every authenticated request, so revocation takes effect immediately. */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    if (!isValidObjectId(sessionId) || !isValidObjectId(userId)) return false;
    const found = await this.sessions.exists({
      _id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    return found !== null;
  }

  async revoke(sessionId: string, reason: RevokeReason): Promise<boolean> {
    const result = await this.sessions.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
    return result.modifiedCount > 0;
  }

  async revokeOwned(userId: string, sessionId: string, reason: RevokeReason): Promise<void> {
    if (!isValidObjectId(sessionId)) throw AppException.notFound('Session');
    const result = await this.sessions.updateOne(
      { _id: sessionId, userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
    if (result.modifiedCount === 0) throw AppException.notFound('Session');
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, exceptSessionId?: string) {
    const result = await this.sessions.updateMany(
      {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}),
      },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
    return result.modifiedCount;
  }

  async listActive(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const sessions = await this.sessions
      .find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ lastUsedAt: -1 })
      .lean();
    return sessions.map((s) => ({
      id: s._id.toString(),
      deviceLabel: s.deviceLabel ?? 'Unknown device',
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s._id.toString() === currentSessionId,
    }));
  }
}

function sessionEnded(): AppException {
  return AppException.unauthorized(
    'Your session has ended. Please sign in again.',
    ErrorCode.SESSION_REVOKED,
  );
}
