import { generateTotp } from '@app/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import {
  createStaff,
  login,
  refreshCookieFrom,
  registerCustomer,
  registrationPayload,
  TEST_PASSWORD,
  XHR,
} from './utils/auth-helpers';
import { createTestApp } from './utils/create-test-app';

describe('Authentication and security (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registration', () => {
    it('creates a customer, signs them in and protects the refresh token cookie', async () => {
      const payload = registrationPayload();
      const res = await http().post('/api/v1/auth/register').send(payload).expect(201);

      expect(res.body.data).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          email: payload.email,
          role: 'CUSTOMER',
          kyc: { status: 'PENDING', panMasked: `XXXXXX${payload.pan.slice(-4)}` },
          mfaEnabled: false,
        },
      });
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toBeUndefined(); // never in the body
      expect(res.body.data.user.customerId).toMatch(/^\d{9}$/);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(payload.pan);

      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('vb_refresh='),
      )!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('rejects invalid input with field-level errors', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send(
          registrationPayload({
            pan: 'BADPAN',
            phone: '12345',
            password: 'weak',
            dateOfBirth: '2015-01-01',
            acceptTerms: false,
            address: { line1: 'x', city: 'Pune', state: 'MH', pincode: '000000' },
          }),
        )
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'pan',
          'phone',
          'password',
          'dateOfBirth',
          'acceptTerms',
          'address.pincode',
        ]),
      );
    });

    it('rejects unknown properties such as a self-assigned role', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ ...registrationPayload(), role: 'ADMIN' })
        .expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('role');
    });

    it('prevents duplicate email and PAN', async () => {
      const { payload } = await registerCustomer(app);
      await http()
        .post('/api/v1/auth/register')
        .send(registrationPayload({ email: payload.email }))
        .expect(409);
      const dupPan = await http()
        .post('/api/v1/auth/register')
        .send(registrationPayload({ pan: payload.pan.toLowerCase() }))
        .expect(409);
      expect(dupPan.body.error.message).toContain('PAN');
    });
  });

  describe('login and lockout', () => {
    it('signs in and returns the profile for a valid access token', async () => {
      const { payload } = await registerCustomer(app);
      const { accessToken } = await login(app, payload.email);
      const me = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.data.email).toBe(payload.email);
    });

    it('requires authentication for protected routes', async () => {
      await http().get('/api/v1/auth/me').expect(401);
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('uses the same error for a wrong password and an unknown email', async () => {
      const { payload } = await registerCustomer(app);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: 'Wrong@123' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'Wrong@123' })
        .expect(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('locks the profile after repeated failures, even for the right password', async () => {
      const { payload } = await registerCustomer(app);
      for (let i = 0; i < 4; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ email: payload.email, password: 'Wrong@123' })
          .expect(401);
      }
      const fifth = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: 'Wrong@123' })
        .expect(423);
      expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
      const correct = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: TEST_PASSWORD })
        .expect(423);
      expect(correct.body.error.details.lockedUntil).toEqual(expect.any(String));
    });

    it('is not fooled by NoSQL operator injection', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: { $ne: null }, password: { $ne: null } })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const { cookie } = await registerCustomer(app);
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set(XHR)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      const rotated = refreshCookieFrom(res);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(cookie);
    });

    it('requires the X-Requested-With header (CSRF defence)', async () => {
      const { cookie } = await registerCustomer(app);
      await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(403);
    });

    it('revokes the whole session when an old refresh token is replayed (theft detection)', async () => {
      const { cookie: first, accessToken } = await registerCustomer(app);
      const r1 = await http()
        .post('/api/v1/auth/refresh')
        .set(XHR)
        .set('Cookie', first)
        .expect(200);
      const second = refreshCookieFrom(r1)!;
      const r2 = await http()
        .post('/api/v1/auth/refresh')
        .set(XHR)
        .set('Cookie', second)
        .expect(200);
      const third = refreshCookieFrom(r2)!;

      // `first` is neither the current token nor the one just rotated out: replay.
      const replay = await http()
        .post('/api/v1/auth/refresh')
        .set(XHR)
        .set('Cookie', first)
        .expect(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');

      // The legitimate user's latest token and access token stop working too.
      await http().post('/api/v1/auth/refresh').set(XHR).set('Cookie', third).expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });

    it('logout revokes the session immediately', async () => {
      const { cookie, accessToken } = await registerCustomer(app);
      const res = await http()
        .post('/api/v1/auth/logout')
        .set(XHR)
        .set('Cookie', cookie)
        .expect(204);
      expect(String(res.headers['set-cookie'])).toContain('vb_refresh=;');
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      await http().post('/api/v1/auth/refresh').set(XHR).set('Cookie', cookie).expect(401);
    });
  });

  describe('two-factor authentication', () => {
    it('enrols with TOTP, requires the second factor and blocks code replay', async () => {
      const { payload, accessToken } = await registerCustomer(app);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const setup = await http().post('/api/v1/auth/mfa/setup').set(auth).expect(200);
      expect(setup.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(setup.body.data.otpauthUrl).toContain('otpauth://totp/Vinay%20Bank');
      const secret = (setup.body.data.manualEntryKey as string).replace(/\s/g, '');

      await http().post('/api/v1/auth/mfa/enable').set(auth).send({ code: '000000' }).expect(400);
      const enabled = await http()
        .post('/api/v1/auth/mfa/enable')
        .set(auth)
        .send({ code: generateTotp(secret) })
        .expect(200);
      const recoveryCodes: string[] = enabled.body.data.recoveryCodes;
      expect(recoveryCodes).toHaveLength(8);

      const step1 = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: TEST_PASSWORD })
        .expect(200);
      expect(step1.body.data).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
      expect(refreshCookieFrom(step1)).toBeUndefined(); // no session before the second factor

      // The enrolment code's time step is spent; the next step's code is accepted (clock-drift window).
      const nextCode = generateTotp(secret, Date.now() + 30_000);
      const step2 = await http()
        .post('/api/v1/auth/login/mfa')
        .send({ mfaToken: step1.body.data.mfaToken, code: nextCode })
        .expect(200);
      expect(step2.body.data.accessToken).toEqual(expect.any(String));
      expect(step2.body.data.user.mfaEnabled).toBe(true);

      // Replaying the same code fails.
      const again = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: TEST_PASSWORD })
        .expect(200);
      await http()
        .post('/api/v1/auth/login/mfa')
        .send({ mfaToken: again.body.data.mfaToken, code: nextCode })
        .expect(401);

      // A recovery code works exactly once.
      const third = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: TEST_PASSWORD })
        .expect(200);
      await http()
        .post('/api/v1/auth/login/mfa')
        .send({ mfaToken: third.body.data.mfaToken, code: recoveryCodes[0] })
        .expect(200);
      const fourth = await http()
        .post('/api/v1/auth/login')
        .send({ email: payload.email, password: TEST_PASSWORD })
        .expect(200);
      await http()
        .post('/api/v1/auth/login/mfa')
        .send({ mfaToken: fourth.body.data.mfaToken, code: recoveryCodes[0] })
        .expect(401);
    });
  });

  describe('password and sessions', () => {
    it('changing the password signs out other devices but keeps this one', async () => {
      const { payload, accessToken: deviceA } = await registerCustomer(app);
      const { accessToken: deviceB } = await login(app, payload.email);

      await http()
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${deviceA}`)
        .send({ currentPassword: 'Wrong@123', newPassword: 'N3w@Password' })
        .expect(400);

      const res = await http()
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${deviceA}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'N3w@Password' })
        .expect(200);
      expect(res.body.data.otherSessionsSignedOut).toBe(1);

      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${deviceA}`).expect(200);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${deviceB}`).expect(401);
      await login(app, payload.email, 'N3w@Password');
    });

    it('lists active sessions and signs out a specific device', async () => {
      const { payload, accessToken } = await registerCustomer(app);
      const other = await login(app, payload.email);
      const list = await http()
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      const target = list.body.data.find((s: { current: boolean }) => !s.current);

      await http()
        .delete(`/api/v1/auth/sessions/${target.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(401);
    });
  });

  describe('role-based access and audit trail', () => {
    it('blocks customers from staff endpoints and lets managers verify the audit chain', async () => {
      const { accessToken: customerToken } = await registerCustomer(app);
      const forbidden = await http()
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      expect(forbidden.body.error.code).toBe('FORBIDDEN');

      const manager = await createStaff(app, Role.MANAGER, 'manager');
      const logs = await http()
        .get('/api/v1/audit?limit=5')
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .expect(200);
      expect(logs.body.meta.total).toBeGreaterThan(5);
      expect(logs.body.data[0]).toMatchObject({ hash: expect.stringMatching(/^[a-f0-9]{64}$/) });

      const verify = await http()
        .get('/api/v1/audit/verify')
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .expect(200);
      expect(verify.body.data).toMatchObject({ valid: true });
      expect(verify.body.data.checked).toBeGreaterThan(5);
    });

    it('publishes a JWKS for other services', async () => {
      const res = await http().get('/api/v1/auth/jwks').expect(200);
      expect(res.body.data.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    });
  });
});
