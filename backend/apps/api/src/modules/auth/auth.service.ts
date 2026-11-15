import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { describeUserAgent, maskEmail, maskTail } from '@app/shared';
import { Role } from '../../common/enums/role.enum';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import type { AppConfig } from '../../config/configuration';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { CountersService } from '../counters/counters.service';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
import { toUserProfile, type UserProfile } from '../users/user.mapper';
import { KycStatus, UserStatus, type UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import {
  AuthEvents,
  type LoginSucceededEvent,
  type SecurityEvent,
  type UserRegisteredEvent,
} from './auth.events';
import type { ChangePasswordDto, LoginDto, MfaLoginDto, RegisterDto } from './dto/auth.dto';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { TokenService } from './token.service';

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  /** Set as an httpOnly cookie by the controller, never returned in the body. */
  refreshToken?: string;
}

export type AuthenticatedResult = { user: UserProfile } & SessionTokens;

export type LoginResult =
  { mfaRequired: true; mfaToken: string } | ({ mfaRequired: false } & AuthenticatedResult);

const CUSTOMER_ID_BASE = 100_000_000;

@Injectable()
export class AuthService {
  private readonly authConfig: AppConfig['auth'];

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldEncryptionService,
    private readonly counters: CountersService,
    private readonly events: EventEmitter2,
    config: ConfigService<AppConfig, true>,
  ) {
    this.authConfig = config.get('auth', { infer: true });
  }

  async register(dto: RegisterDto, ctx: RequestContext): Promise<AuthenticatedResult> {
    const email = dto.email.toLowerCase();
    const panIndex = this.crypto.blindIndex(dto.pan, 'pan');

    // Friendly checks first; the unique indexes remain the real guarantee under concurrency.
    if (await this.users.existsBy({ email })) {
      throw AppException.conflict(
        'An account with this email already exists',
        ErrorCode.DUPLICATE_RESOURCE,
      );
    }
    if (await this.users.existsBy({ phone: dto.phone })) {
      throw AppException.conflict(
        'This mobile number is already registered',
        ErrorCode.DUPLICATE_RESOURCE,
      );
    }
    if (await this.users.existsBy({ 'kyc.panBlindIndex': panIndex })) {
      throw AppException.conflict(
        'This PAN is already linked to a customer',
        ErrorCode.DUPLICATE_RESOURCE,
      );
    }

    // The id is generated up front so the PAN ciphertext can be bound to this record (AAD).
    const userId = new Types.ObjectId();
    const customerId = String(CUSTOMER_ID_BASE + (await this.counters.next('customer')));
    const user = await this.users.create({
      _id: userId,
      role: Role.CUSTOMER,
      email,
      phone: dto.phone,
      passwordHash: await this.passwords.hash(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: new Date(dto.dateOfBirth),
      address: dto.address,
      customerId,
      kyc: {
        status: KycStatus.PENDING,
        panEncrypted: this.crypto.encrypt(dto.pan, `user:${userId.toString()}:pan`),
        panMasked: maskTail(dto.pan, 4),
        panBlindIndex: panIndex,
      },
    });

    await this.audit.record({
      action: AuditAction.AUTH_REGISTERED,
      actor: { id: user.id, role: user.role, label: email },
      entity: { type: 'User', id: user.id },
      context: ctx,
      details: { customerId },
    });
    // Awaited so that listeners (e.g. opening the first savings account) finish before we respond.
    await this.events.emitAsync(AuthEvents.USER_REGISTERED, {
      userId: user.id,
    } satisfies UserRegisteredEvent);

    const tokens = await this.startSession(user, ctx);
    await this.users.registerSuccessfulLogin(user._id.toString(), ctx.ip);
    return { user: toUserProfile(user), ...tokens };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<LoginResult> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    if (user && isLocked(user)) {
      await this.audit.record({
        action: AuditAction.AUTH_LOGIN_FAILED,
        outcome: 'FAILURE',
        actor: { id: user.id, role: user.role, label: user.email },
        context: ctx,
        details: { reason: 'ACCOUNT_LOCKED' },
      });
      throw lockedError(user.lockUntil!);
    }

    const passwordOk = await this.passwords.verify(dto.password, user?.passwordHash);
    if (!user || !passwordOk) {
      await this.handleFailedAttempt(user, ctx, 'BAD_CREDENTIALS', dto.email);
      // Same message whether the email exists or not: no account enumeration.
      throw AppException.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        'This profile has been disabled. Please contact your branch.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (user.mfa?.enabled) {
      return { mfaRequired: true, mfaToken: await this.tokens.signMfaToken(user._id.toString()) };
    }
    return this.completeLogin(user, ctx);
  }

  async loginWithMfa(dto: MfaLoginDto, ctx: RequestContext): Promise<LoginResult> {
    const userId = await this.tokens.verifyMfaToken(dto.mfaToken);
    const user = await this.users.findByIdOrThrow(userId);
    if (isLocked(user)) throw lockedError(user.lockUntil!);

    if (!(await this.mfa.verify(userId, dto.code))) {
      // MFA failures count towards the lockout, which stops brute-forcing 6-digit codes.
      await this.handleFailedAttempt(user, ctx, 'BAD_MFA_CODE');
      throw new AppException(
        ErrorCode.INVALID_MFA_CODE,
        'The verification code is incorrect or has expired',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.completeLogin(user, ctx);
  }

  async refresh(rawToken: string | undefined, ctx: RequestContext): Promise<AuthenticatedResult> {
    if (!rawToken) {
      throw AppException.unauthorized('No active session', ErrorCode.SESSION_REVOKED);
    }
    const { session, refreshToken } = await this.sessions.rotate(rawToken, ctx);
    const user = await this.users.findById(session.userId.toString());
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.sessions.revoke(session._id.toString(), 'USER_DISABLED');
      throw AppException.unauthorized('Your session has ended', ErrorCode.SESSION_REVOKED);
    }
    const access = await this.tokens.signAccessToken({
      sub: user.id,
      role: user.role,
      sid: session.id,
    });
    return {
      user: toUserProfile(user),
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
    };
  }

  /** Logout works from the refresh cookie, so it succeeds even after the access token expired. */
  async logout(rawRefreshToken: string | undefined, ctx: RequestContext): Promise<void> {
    const parsed = SessionsService.parseRefreshToken(rawRefreshToken);
    if (!parsed) return;
    const session = await this.sessions.findById(parsed.sessionId);
    if (!session || session.revokedAt) return;
    await this.sessions.revoke(session._id.toString(), 'LOGOUT');
    await this.audit.record({
      action: AuditAction.AUTH_LOGGED_OUT,
      actor: { id: session.userId.toString() },
      entity: { type: 'Session', id: session.id },
      context: ctx,
    });
  }

  async me(user: AuthUser): Promise<UserProfile> {
    return toUserProfile(await this.users.findByIdOrThrow(user.id));
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ctx: RequestContext) {
    const record = await this.users.findByIdWithPassword(user.id);
    if (!record) throw AppException.notFound('User');
    if (!(await this.passwords.verify(dto.currentPassword, record.passwordHash))) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, 'Your current password is incorrect');
    }
    if (await this.passwords.verify(dto.newPassword, record.passwordHash)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Choose a new password that is different from the current one',
      );
    }
    record.passwordHash = await this.passwords.hash(dto.newPassword);
    record.passwordChangedAt = new Date();
    await record.save();

    // Sign out every other device; the current one stays signed in.
    const signedOut = await this.sessions.revokeAllForUser(
      user.id,
      'PASSWORD_CHANGED',
      user.sessionId,
    );
    await this.audit.record({
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'User', id: user.id },
      context: ctx,
      details: { otherSessionsSignedOut: signedOut },
    });
    this.events.emit(AuthEvents.PASSWORD_CHANGED, {
      userId: user.id,
      at: new Date(),
    } satisfies SecurityEvent);
    return { otherSessionsSignedOut: signedOut };
  }

  async beginMfaSetup(user: AuthUser) {
    return this.mfa.beginSetup(await this.users.findByIdOrThrow(user.id));
  }

  async enableMfa(user: AuthUser, code: string, ctx: RequestContext) {
    const result = await this.mfa.enable(user.id, code);
    await this.audit.record({
      action: AuditAction.AUTH_MFA_ENABLED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'User', id: user.id },
      context: ctx,
    });
    this.events.emit(AuthEvents.MFA_CHANGED, {
      userId: user.id,
      at: new Date(),
      detail: 'enabled',
    } satisfies SecurityEvent);
    return result;
  }

  async disableMfa(user: AuthUser, password: string, code: string, ctx: RequestContext) {
    const record = await this.users.findByIdWithPassword(user.id);
    if (!record?.mfa?.enabled) {
      throw AppException.unprocessable(
        ErrorCode.INVALID_STATE,
        'Two-factor authentication is not enabled',
      );
    }
    if (!(await this.passwords.verify(password, record.passwordHash))) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, 'Your password is incorrect');
    }
    if (!(await this.mfa.verify(user.id, code))) {
      throw new AppException(
        ErrorCode.INVALID_MFA_CODE,
        'The verification code is incorrect or has expired',
      );
    }
    await this.mfa.disable(user.id);
    await this.audit.record({
      action: AuditAction.AUTH_MFA_DISABLED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'User', id: user.id },
      context: ctx,
    });
    this.events.emit(AuthEvents.MFA_CHANGED, {
      userId: user.id,
      at: new Date(),
      detail: 'disabled',
    } satisfies SecurityEvent);
  }

  async revokeSession(user: AuthUser, sessionId: string, ctx: RequestContext) {
    await this.sessions.revokeOwned(user.id, sessionId, 'USER_REVOKED');
    await this.audit.record({
      action: AuditAction.AUTH_SESSION_REVOKED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Session', id: sessionId },
      context: ctx,
    });
  }

  async revokeOtherSessions(user: AuthUser, ctx: RequestContext) {
    const count = await this.sessions.revokeAllForUser(user.id, 'USER_REVOKED', user.sessionId);
    await this.audit.record({
      action: AuditAction.AUTH_SESSION_REVOKED,
      actor: { id: user.id, role: user.role },
      context: ctx,
      details: { scope: 'ALL_OTHER_SESSIONS', count },
    });
    return { signedOut: count };
  }

  // ---------------------------------------------------------------------------

  private async completeLogin(user: UserDocument, ctx: RequestContext): Promise<LoginResult> {
    await this.users.registerSuccessfulLogin(user._id.toString(), ctx.ip);
    const tokens = await this.startSession(user, ctx);
    await this.audit.record({
      action: AuditAction.AUTH_LOGIN_SUCCEEDED,
      actor: { id: user.id, role: user.role, label: user.email },
      context: ctx,
      details: { mfa: Boolean(user.mfa?.enabled) },
    });
    this.events.emit(AuthEvents.LOGIN_SUCCEEDED, {
      userId: user.id,
      deviceLabel: describeUserAgent(ctx.userAgent),
      ip: ctx.ip,
      at: new Date(),
    } satisfies LoginSucceededEvent);
    user.lastLoginAt = new Date();
    return { mfaRequired: false, user: toUserProfile(user), ...tokens };
  }

  private async startSession(user: UserDocument, ctx: RequestContext): Promise<SessionTokens> {
    const { session, refreshToken } = await this.sessions.create(user._id.toString(), ctx);
    const access = await this.tokens.signAccessToken({
      sub: user.id,
      role: user.role,
      sid: session.id,
    });
    return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken };
  }

  private async handleFailedAttempt(
    user: UserDocument | null,
    ctx: RequestContext,
    reason: 'BAD_CREDENTIALS' | 'BAD_MFA_CODE',
    attemptedEmail?: string,
  ): Promise<void> {
    if (!user) {
      await this.audit.record({
        action: AuditAction.AUTH_LOGIN_FAILED,
        outcome: 'FAILURE',
        actor: { label: attemptedEmail ? maskEmail(attemptedEmail) : undefined },
        context: ctx,
        details: { reason: 'UNKNOWN_USER' },
      });
      return;
    }
    const { maxLoginAttempts, lockoutMinutes } = this.authConfig;
    const attempt = await this.users.registerFailedLogin(
      user._id.toString(),
      maxLoginAttempts,
      lockoutMinutes,
    );
    await this.audit.record({
      action:
        reason === 'BAD_MFA_CODE' ? AuditAction.AUTH_MFA_FAILED : AuditAction.AUTH_LOGIN_FAILED,
      outcome: 'FAILURE',
      actor: { id: user.id, role: user.role, label: user.email },
      context: ctx,
      details: { reason, attemptsLeft: attempt.attemptsLeft },
    });
    if (attempt.locked && attempt.lockUntil) {
      await this.audit.record({
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        outcome: 'FAILURE',
        actor: { id: user.id, role: user.role, label: user.email },
        context: ctx,
        details: { lockedUntil: attempt.lockUntil.toISOString() },
      });
      this.events.emit(AuthEvents.ACCOUNT_LOCKED, {
        userId: user.id,
        at: new Date(),
        detail: attempt.lockUntil.toISOString(),
      } satisfies SecurityEvent);
      throw lockedError(attempt.lockUntil);
    }
  }
}

function isLocked(user: UserDocument): boolean {
  return Boolean(user.lockUntil && user.lockUntil > new Date());
}

function lockedError(lockUntil: Date): AppException {
  const minutes = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60_000));
  return new AppException(
    ErrorCode.ACCOUNT_LOCKED,
    `Too many unsuccessful attempts. Your profile is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    HttpStatus.LOCKED,
    { lockedUntil: lockUntil.toISOString() },
  );
}
