import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  errors as joseErrors,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import type { Role } from '../../common/enums/role.enum';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import type { AppConfig } from '../../config/configuration';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  sid: string;
}

export interface IssuedToken {
  token: string;
  expiresIn: number;
}

type TokenType = 'access' | 'mfa';

const MFA_TOKEN_TTL_SECONDS = 300;

/**
 * Issues and verifies JWTs signed with RS256 (RSA + SHA-256).
 *
 * Asymmetric signing means only this API holds the private key, while any other
 * service can verify tokens with the public key published at /auth/jwks, with no
 * shared secret to leak. Verification pins the algorithm list to RS256, which
 * blocks "alg: none" and HS256/RS256 key-confusion attacks.
 *
 * Uses `jose` rather than `jsonwebtoken`: jsonwebtoken's dependency chain
 * (buffer-equal-constant-time) crashes on Node.js 25, which removed SlowBuffer.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private keyId!: string;
  private publicJwk!: JWK;
  private readonly auth: AppConfig['auth'];

  constructor(config: ConfigService<AppConfig, true>) {
    this.auth = config.get('auth', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    const { jwtPrivateKeyPem, jwtPublicKeyPem } = this.auth;
    if (!jwtPrivateKeyPem || !jwtPublicKeyPem) {
      throw new Error('JWT signing keys are missing. Run `npm run setup` to generate them.');
    }
    this.privateKey = await importPKCS8(jwtPrivateKeyPem, 'RS256');
    this.publicKey = await importSPKI(jwtPublicKeyPem, 'RS256');
    const der = createPublicKey(jwtPublicKeyPem).export({ type: 'spki', format: 'der' });
    this.keyId = createHash('sha256').update(der).digest('base64url').slice(0, 16);
    this.publicJwk = {
      ...(await exportJWK(this.publicKey)),
      kid: this.keyId,
      alg: 'RS256',
      use: 'sig',
    };
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<IssuedToken> {
    const token = await this.sign(
      { role: claims.role, sid: claims.sid },
      claims.sub,
      'access',
      this.auth.accessTtlSeconds,
    );
    return { token, expiresIn: this.auth.accessTtlSeconds };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const payload = await this.verify(token, 'access');
    if (typeof payload.sid !== 'string' || typeof payload.role !== 'string') {
      throw AppException.unauthorized('Invalid access token');
    }
    return { sub: payload.sub as string, role: payload.role as Role, sid: payload.sid };
  }

  /** Short-lived token proving the password step passed, exchanged for a session after the MFA code. */
  signMfaToken(userId: string): Promise<string> {
    return this.sign({}, userId, 'mfa', MFA_TOKEN_TTL_SECONDS);
  }

  async verifyMfaToken(token: string): Promise<string> {
    const payload = await this.verify(token, 'mfa');
    return payload.sub as string;
  }

  /** JSON Web Key Set for other services that need to verify our tokens. */
  getJwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  private sign(
    claims: Record<string, unknown>,
    subject: string,
    type: TokenType,
    ttlSeconds: number,
  ): Promise<string> {
    return new SignJWT({ ...claims, typ: type })
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
      .setSubject(subject)
      .setIssuer(this.auth.issuer)
      .setAudience(this.auth.audience)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.privateKey);
  }

  private async verify(token: string, type: TokenType): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.auth.issuer,
        audience: this.auth.audience,
        algorithms: ['RS256'],
      });
      if (payload.typ !== type || typeof payload.sub !== 'string') {
        throw new Error(`Expected a ${type} token`);
      }
      return payload;
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw AppException.unauthorized(
          type === 'mfa'
            ? 'The sign-in step expired. Please start again.'
            : 'Your session has expired',
          ErrorCode.TOKEN_EXPIRED,
        );
      }
      throw AppException.unauthorized('Invalid or malformed token');
    }
  }
}
