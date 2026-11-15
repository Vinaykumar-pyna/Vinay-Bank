import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { createStaff, login, registerCustomer, TEST_PASSWORD } from './utils/auth-helpers';
import {
  account,
  auth,
  fund,
  myAccounts,
  RUPEE,
  verifyKyc,
  waitForNotification,
} from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

describe('Staff portal (e2e)', () => {
  let app: NestExpressApplication;
  let teller: { accessToken: string };
  let manager: { accessToken: string };
  let admin: { accessToken: string };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teller = await createStaff(app, Role.TELLER, 'teller');
    manager = await createStaff(app, Role.MANAGER, 'manager');
    admin = await createStaff(app, Role.ADMIN, 'admin');
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
  });

  async function customerWithAccount(rupees = 0) {
    const reg = await registerCustomer(app);
    await verifyKyc(app, reg.user.id);
    const [savings] = await myAccounts(app, reg.accessToken);
    if (rupees) await fund(app, savings.id, rupees);
    return { ...reg, savings };
  }

  const cash = (
    kind: 'deposit' | 'withdrawal',
    token: string,
    body: object,
    key: string = randomUUID(),
  ) =>
    http()
      .post(`/api/v1/staff/cash/${kind}`)
      .set(auth(token))
      .set('Idempotency-Key', key)
      .send(body);

  async function pendingApprovalFor(entityId: string) {
    const queue = await http()
      .get('/api/v1/approvals?status=PENDING&limit=100')
      .set(auth(manager.accessToken))
      .expect(200);
    return queue.body.data.find((a: { entityId: string }) => a.entityId === entityId);
  }

  describe('cash operations', () => {
    it('posts a small cash deposit immediately and alerts the customer', async () => {
      const c = await customerWithAccount();
      const res = await cash('deposit', teller.accessToken, {
        accountNumber: c.savings.accountNumber,
        amount: 10_000 * RUPEE,
        remarks: 'Counter deposit',
      }).expect(201);
      expect(res.body.data).toMatchObject({
        status: 'COMPLETED',
        type: 'CASH_DEPOSIT',
        rail: 'CASH',
      });
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(10_000 * RUPEE);
      await waitForNotification(app, c.user.id, 'credited');
    });

    it('needs a manager to approve a large deposit; the teller cannot decide', async () => {
      const c = await customerWithAccount();
      const res = await cash('deposit', teller.accessToken, {
        accountNumber: c.savings.accountNumber,
        amount: 300_000 * RUPEE,
      }).expect(201);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(0);

      const approval = await pendingApprovalFor(res.body.data.id);
      expect(approval).toMatchObject({ type: 'CASH_DEPOSIT', makerRole: 'TELLER' });
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(teller.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(403);
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(200);
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(300_000 * RUPEE);
    });

    it('holds a large withdrawal and releases the hold on rejection', async () => {
      const c = await customerWithAccount(100_000);
      const res = await cash('withdrawal', teller.accessToken, {
        accountNumber: c.savings.accountNumber,
        amount: 60_000 * RUPEE,
      }).expect(201);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
      expect(await account(app, c.accessToken, c.savings.id)).toMatchObject({
        holdAmount: 60_000 * RUPEE,
        availableBalance: 40_000 * RUPEE,
      });

      const approval = await pendingApprovalFor(res.body.data.id);
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'REJECTED', remarks: 'Signature mismatch on withdrawal slip' })
        .expect(200);
      expect(await account(app, c.accessToken, c.savings.id)).toMatchObject({
        holdAmount: 0,
        ledgerBalance: 100_000 * RUPEE,
      });
    });

    it('refuses withdrawals above the available balance', async () => {
      const c = await customerWithAccount(1_000);
      const res = await cash('withdrawal', teller.accessToken, {
        accountNumber: c.savings.accountNumber,
        amount: 5_000 * RUPEE,
      }).expect(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('enforces four eyes between managers: a manager cannot approve their own request', async () => {
      const c = await customerWithAccount();
      const res = await cash('deposit', manager.accessToken, {
        accountNumber: c.savings.accountNumber,
        amount: 250_000 * RUPEE,
      }).expect(201);
      const approval = await pendingApprovalFor(res.body.data.id);
      const own = await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(403);
      expect(own.body.error.code).toBe('MAKER_CHECKER_VIOLATION');
      const otherManager = await createStaff(app, Role.MANAGER, 'manager2');
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(otherManager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(200);
    });

    it('replays a retried cash slip instead of posting it twice', async () => {
      const c = await customerWithAccount();
      const body = { accountNumber: c.savings.accountNumber, amount: 5_000 * RUPEE };
      const key = randomUUID();
      const first = await cash('deposit', teller.accessToken, body, key).expect(201);
      const retry = await cash('deposit', teller.accessToken, body, key).expect(200);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(5_000 * RUPEE);

      const reused = await cash(
        'deposit',
        teller.accessToken,
        { ...body, amount: 6_000 * RUPEE },
        key,
      ).expect(422);
      expect(reused.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      await http()
        .post('/api/v1/staff/cash/deposit')
        .set(auth(teller.accessToken))
        .send(body)
        .expect(400);
    });

    it('looks up account holders for the teller counter', async () => {
      const c = await customerWithAccount();
      const res = await http()
        .get(`/api/v1/staff/accounts/lookup?accountNumber=${c.savings.accountNumber}`)
        .set(auth(teller.accessToken))
        .expect(200);
      expect(res.body.data).toMatchObject({
        accountNumber: c.savings.accountNumber,
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
      });
      await http()
        .get('/api/v1/staff/accounts/lookup?accountNumber=123')
        .set(auth(teller.accessToken))
        .expect(400);
    });
  });

  describe('customers and KYC', () => {
    it('lets managers verify KYC but not tellers, and notifies the customer', async () => {
      const reg = await registerCustomer(app);
      await http()
        .post(`/api/v1/staff/customers/${reg.user.id}/kyc`)
        .set(auth(teller.accessToken))
        .send({ decision: 'VERIFIED', remarks: 'Documents checked' })
        .expect(403);
      const res = await http()
        .post(`/api/v1/staff/customers/${reg.user.id}/kyc`)
        .set(auth(manager.accessToken))
        .send({ decision: 'VERIFIED', remarks: 'Video KYC completed' })
        .expect(200);
      expect(res.body.data.kyc.status).toBe('VERIFIED');
      await waitForNotification(app, reg.user.id, 'KYC is verified');
    });

    it('searches customers by name prefix and masks mobile numbers for tellers', async () => {
      const reg = await registerCustomer(app, { firstName: 'Zubin' });
      const asTeller = await http()
        .get('/api/v1/staff/customers?search=zub')
        .set(auth(teller.accessToken))
        .expect(200);
      const hit = asTeller.body.data.find((c: { id: string }) => c.id === reg.user.id);
      expect(hit).toMatchObject({ fullName: expect.stringContaining('Zubin'), accounts: 1 });
      expect(hit.phone).toMatch(/^\*+\d{4}$/);
      const asManager = await http()
        .get('/api/v1/staff/customers?search=zub')
        .set(auth(manager.accessToken))
        .expect(200);
      expect(asManager.body.data.find((c: { id: string }) => c.id === reg.user.id).phone).toBe(
        reg.payload.phone,
      );

      const detail = await http()
        .get(`/api/v1/staff/customers/${reg.user.id}`)
        .set(auth(teller.accessToken))
        .expect(200);
      expect(detail.body.data.accounts).toHaveLength(1);
      expect(JSON.stringify(detail.body.data)).not.toContain('passwordHash');
    });

    it('signs a disabled customer out everywhere and blocks new sign-ins', async () => {
      const reg = await registerCustomer(app);
      await http()
        .post(`/api/v1/staff/users/${reg.user.id}/status`)
        .set(auth(manager.accessToken))
        .send({ status: 'DISABLED', reason: 'Test' })
        .expect(403);
      await http()
        .post(`/api/v1/staff/users/${reg.user.id}/status`)
        .set(auth(admin.accessToken))
        .send({ status: 'DISABLED', reason: 'Suspected account takeover' })
        .expect(200);
      await http().get('/api/v1/auth/me').set(auth(reg.accessToken)).expect(401);
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: reg.payload.email, password: TEST_PASSWORD })
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('administration', () => {
    it('lets admins create staff who can then sign in', async () => {
      const email = `newteller.${Date.now()}@arthabank.test`;
      await http()
        .post('/api/v1/staff/users')
        .set(auth(manager.accessToken))
        .send({
          firstName: 'New',
          lastName: 'Teller',
          email,
          phone: '9111222333',
          role: 'TELLER',
          branchCode: '0002',
          password: 'Str0ng@Pass',
        })
        .expect(403);
      const res = await http()
        .post('/api/v1/staff/users')
        .set(auth(admin.accessToken))
        .send({
          firstName: 'New',
          lastName: 'Teller',
          email,
          phone: '9111222333',
          role: 'TELLER',
          branchCode: '0002',
          password: 'Str0ng@Pass',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        role: 'TELLER',
        branchCode: '0002',
        employeeId: expect.stringMatching(/^EMP\d{4}$/),
      });
      const session = await login(app, email, 'Str0ng@Pass');
      expect(session.accessToken).toEqual(expect.any(String));
    });

    it('reports KPIs on the staff overview and hides it from customers', async () => {
      const res = await http()
        .get('/api/v1/staff/overview')
        .set(auth(manager.accessToken))
        .expect(200);
      expect(res.body.data).toMatchObject({
        customers: { total: expect.any(Number), kycPending: expect.any(Number) },
        accounts: { total: expect.any(Number) },
        approvals: { pending: expect.any(Number) },
      });
      expect(res.body.data.volume7d).toHaveLength(7);
      const c = await customerWithAccount();
      await http().get('/api/v1/staff/overview').set(auth(c.accessToken)).expect(403);
    });
  });
});
