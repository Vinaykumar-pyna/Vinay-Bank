import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { SettlementService } from '../src/modules/transactions/transfers/settlement.service';
import { createStaff, registerCustomer } from './utils/auth-helpers';
import {
  account,
  addBeneficiary,
  ageBeneficiary,
  auth,
  execute,
  fund,
  latestOtp,
  myAccounts,
  quote,
  RUPEE,
  verifyKyc,
  waitForNotification,
} from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

describe('Core banking (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300)); // let async notification listeners finish
    await app.close();
  });

  /** A verified customer with a funded savings account. */
  async function customer(rupees = 0) {
    const reg = await registerCustomer(app);
    await verifyKyc(app, reg.user.id);
    const [savings] = await myAccounts(app, reg.accessToken);
    if (rupees) await fund(app, savings.id, rupees);
    return { ...reg, token: reg.accessToken, savings };
  }

  describe('accounts', () => {
    it('opens a zero-balance savings account on registration', async () => {
      const reg = await registerCustomer(app);
      const accounts = await myAccounts(app, reg.accessToken);
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({ type: 'SAVINGS', status: 'ACTIVE', ledgerBalance: 0 });
      expect(accounts[0].accountNumber).toMatch(/^0001\d{8}$/);
      expect(accounts[0].ifsc).toBe('VINB0000001');
    });

    it('requires a manager to approve an additional account, never the requester', async () => {
      const c = await customer();
      const requested = await http()
        .post('/api/v1/accounts')
        .set(auth(c.token))
        .send({ type: 'CURRENT', nickname: 'Business' })
        .expect(201);
      expect(requested.body.data.status).toBe('PENDING_APPROVAL');

      const manager = await createStaff(app, Role.MANAGER, 'mgr-acct');
      const queue = await http()
        .get('/api/v1/approvals?status=PENDING')
        .set(auth(manager.accessToken))
        .expect(200);
      const approval = queue.body.data.find(
        (a: { entityId: string }) => a.entityId === requested.body.data.id,
      );
      expect(approval).toMatchObject({ type: 'ACCOUNT_OPENING', status: 'PENDING' });

      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(c.token))
        .send({ decision: 'APPROVED' })
        .expect(403);
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(200);
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(409);

      const accounts = await myAccounts(app, c.token);
      expect(accounts.find((a) => a.id === requested.body.data.id)?.status).toBe('ACTIVE');
    });

    it('hides other customers’ accounts (404, not 403)', async () => {
      const a = await customer(1000);
      const b = await customer();
      await http().get(`/api/v1/accounts/${a.savings.id}`).set(auth(b.token)).expect(404);
      await http().get(`/api/v1/accounts/${a.savings.id}/statement`).set(auth(b.token)).expect(404);
    });
  });

  describe('transfers', () => {
    it('moves money between own accounts atomically with running-balance postings', async () => {
      const c = await customer(10_000);
      const manager = await createStaff(app, Role.MANAGER, 'mgr-own');
      const req = await http()
        .post('/api/v1/accounts')
        .set(auth(c.token))
        .send({ type: 'CURRENT' })
        .expect(201);
      const queue = await http()
        .get('/api/v1/approvals?status=PENDING&limit=100')
        .set(auth(manager.accessToken));
      const approval = queue.body.data.find(
        (a: { entityId: string }) => a.entityId === req.body.data.id,
      );
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(200);

      const q = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'OWN',
        toAccountId: req.body.data.id,
        amount: 2_500 * RUPEE,
      }).expect(200);
      expect(q.body.data).toMatchObject({
        rail: 'INTERNAL',
        fee: 0,
        otp: null,
        approvalRequired: false,
      });

      const done = await execute(app, c.token, q.body.data.quoteToken).expect(201);
      expect(done.body.data.status).toBe('COMPLETED');
      expect((await account(app, c.token, c.savings.id)).ledgerBalance).toBe(7_500 * RUPEE);
      expect((await account(app, c.token, req.body.data.id)).ledgerBalance).toBe(2_500 * RUPEE);

      const statement = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement`)
        .set(auth(c.token))
        .expect(200);
      expect(statement.body.data[0]).toMatchObject({
        direction: 'DEBIT',
        amount: 2_500 * RUPEE,
        balanceAfter: 7_500 * RUPEE,
      });
    });

    it('requires an SMS OTP for payees, credits the payee, and replays idempotently without a second debit', async () => {
      const sender = await customer(20_000);
      const receiver = await customer();
      const added = await addBeneficiary(app, sender.token, {
        name: 'Receiver Test',
        accountNumber: receiver.savings.accountNumber,
        ifsc: receiver.savings.ifsc,
      }).expect(201);
      expect(added.body.data).toMatchObject({
        isInternal: true,
        inCoolingPeriod: true,
        bankName: 'Vinay Bank',
      });

      const before = new Date();
      const q = await quote(app, sender.token, {
        fromAccountId: sender.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: added.body.data.id,
        amount: 3_000 * RUPEE,
        remarks: 'Books',
      }).expect(200);
      expect(q.body.data.otp).toMatchObject({
        channel: 'SMS',
        destination: expect.stringContaining('+91'),
      });
      await execute(app, sender.token, q.body.data.quoteToken).expect(400); // OTP missing

      const otp = await latestOtp(app, sender.user.id, before);
      const key = randomUUID();
      const first = await execute(app, sender.token, q.body.data.quoteToken, otp, key).expect(201);
      expect(first.body.data).toMatchObject({
        status: 'COMPLETED',
        rail: 'INTERNAL',
        amount: 3_000 * RUPEE,
        direction: 'DEBIT',
      });

      const replay = await execute(app, sender.token, q.body.data.quoteToken, otp, key).expect(200);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.data.id).toBe(first.body.data.id);

      expect((await account(app, sender.token, sender.savings.id)).ledgerBalance).toBe(
        17_000 * RUPEE,
      );
      expect((await account(app, receiver.token, receiver.savings.id)).ledgerBalance).toBe(
        3_000 * RUPEE,
      );
      await waitForNotification(app, receiver.user.id, 'credited');

      // The receiver sees the same transaction as a credit; a stranger cannot see it at all.
      const asReceiver = await http()
        .get(`/api/v1/transactions/${first.body.data.id}`)
        .set(auth(receiver.token))
        .expect(200);
      expect(asReceiver.body.data.direction).toBe('CREDIT');
      const stranger = await customer();
      await http()
        .get(`/api/v1/transactions/${first.body.data.id}`)
        .set(auth(stranger.token))
        .expect(404);
    });

    it('rejects reusing an idempotency key for a different transfer', async () => {
      const c = await customer(5_000);
      const other = await customer();
      const ben = await addBeneficiary(app, c.token, {
        name: 'Other Person',
        accountNumber: other.savings.accountNumber,
        ifsc: other.savings.ifsc,
      });
      const before = new Date();
      const q1 = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 100 * RUPEE,
      }).expect(200);
      const key = randomUUID();
      await execute(
        app,
        c.token,
        q1.body.data.quoteToken,
        await latestOtp(app, c.user.id, before),
        key,
      ).expect(201);

      const q2 = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 200 * RUPEE,
      }).expect(200);
      const conflict = await execute(app, c.token, q2.body.data.quoteToken, '123456', key).expect(
        422,
      );
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      const malformed = await http()
        .post('/api/v1/transfers')
        .set(auth(c.token))
        .set('Idempotency-Key', 'short')
        .send({ quoteToken: q2.body.data.quoteToken });
      expect(malformed.status).toBe(400);
      expect((await account(app, c.token, c.savings.id)).ledgerBalance).toBe(4_900 * RUPEE);
    });

    it('limits wrong OTP attempts', async () => {
      const c = await customer(5_000);
      const other = await customer();
      const ben = await addBeneficiary(app, c.token, {
        name: 'Someone Else',
        accountNumber: other.savings.accountNumber,
        ifsc: other.savings.ifsc,
      });
      const q = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 100 * RUPEE,
      }).expect(200);
      const wrong1 = await execute(app, c.token, q.body.data.quoteToken, '111111').expect(400);
      expect(wrong1.body.error).toMatchObject({
        code: 'INVALID_OTP',
        details: { attemptsLeft: 2 },
      });
      await execute(app, c.token, q.body.data.quoteToken, '222222').expect(400);
      await execute(app, c.token, q.body.data.quoteToken, '333333').expect(400);
      const exhausted = await execute(app, c.token, q.body.data.quoteToken, '444444').expect(400);
      expect(exhausted.body.error.message).toMatch(/too many/i);
    });

    it('refuses transfers above the available balance', async () => {
      const c = await customer(1_000);
      const other = await customer();
      const ben = await addBeneficiary(app, c.token, {
        name: 'Payee Name',
        accountNumber: other.savings.accountNumber,
        ifsc: other.savings.ifsc,
      });
      const res = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 5_000 * RUPEE,
      }).expect(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('caps transfers to a new payee during the cooling period and enforces the daily limit', async () => {
      const c = await customer(200_000);
      const other = await customer();
      const ben = await addBeneficiary(app, c.token, {
        name: 'New Payee',
        accountNumber: other.savings.accountNumber,
        ifsc: other.savings.ifsc,
      });
      const capped = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 60_000 * RUPEE,
      }).expect(422);
      expect(capped.body.error.code).toBe('LIMIT_EXCEEDED');
      expect(capped.body.error.details.maxAmount).toBe(50_000 * RUPEE);

      await ageBeneficiary(app, ben.body.data.id);
      await http()
        .patch(`/api/v1/accounts/${c.savings.id}`)
        .set(auth(c.token))
        .send({ dailyTransferLimit: 10_000 * RUPEE })
        .expect(200);
      const overLimit = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 15_000 * RUPEE,
      }).expect(422);
      expect(overLimit.body.error).toMatchObject({
        code: 'LIMIT_EXCEEDED',
        details: { remaining: 10_000 * RUPEE },
      });
    });

    it('never overdraws under concurrent transfers (atomic conditional debit + ACID transactions)', async () => {
      const c = await customer(10_000);
      const manager = await createStaff(app, Role.MANAGER, 'mgr-conc');
      const req = await http()
        .post('/api/v1/accounts')
        .set(auth(c.token))
        .send({ type: 'CURRENT' });
      const queue = await http()
        .get('/api/v1/approvals?status=PENDING&limit=100')
        .set(auth(manager.accessToken));
      const approval = queue.body.data.find(
        (a: { entityId: string }) => a.entityId === req.body.data.id,
      );
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' });

      const quotes = await Promise.all(
        Array.from({ length: 5 }, () =>
          quote(app, c.token, {
            fromAccountId: c.savings.id,
            mode: 'OWN',
            toAccountId: req.body.data.id,
            amount: 4_000 * RUPEE,
          }),
        ),
      );
      const results = await Promise.all(
        quotes.map((q) => execute(app, c.token, q.body.data.quoteToken)),
      );
      const succeeded = results.filter((r) => r.status === 201).length;
      const failed = results.filter(
        (r) => r.status === 422 && r.body.error.code === 'INSUFFICIENT_FUNDS',
      ).length;
      expect(succeeded).toBe(2);
      expect(failed).toBe(3);
      const after = await account(app, c.token, c.savings.id);
      expect(after.ledgerBalance).toBe(2_000 * RUPEE);
    });
  });

  describe('maker-checker for high-value and risky transfers', () => {
    it('holds a high-value transfer, then moves the money when a manager approves', async () => {
      const sender = await customer(500_000);
      const receiver = await customer();
      const ben = await addBeneficiary(app, sender.token, {
        name: 'Big Payee',
        accountNumber: receiver.savings.accountNumber,
        ifsc: receiver.savings.ifsc,
      });
      await ageBeneficiary(app, ben.body.data.id);

      const before = new Date();
      const q = await quote(app, sender.token, {
        fromAccountId: sender.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 250_000 * RUPEE,
      }).expect(200);
      expect(q.body.data.approvalRequired).toBe(true);
      const otp = await latestOtp(app, sender.user.id, before);
      const held = await execute(app, sender.token, q.body.data.quoteToken, otp).expect(201);
      expect(held.body.data.status).toBe('PENDING_APPROVAL');

      const onHold = await account(app, sender.token, sender.savings.id);
      expect(onHold).toMatchObject({
        ledgerBalance: 500_000 * RUPEE,
        holdAmount: 250_000 * RUPEE,
        availableBalance: 250_000 * RUPEE,
      });

      const manager = await createStaff(app, Role.MANAGER, 'mgr-hv');
      const queue = await http()
        .get('/api/v1/approvals?status=PENDING&type=HIGH_VALUE_TRANSFER&limit=100')
        .set(auth(manager.accessToken));
      const approval = queue.body.data.find(
        (a: { entityId: string }) => a.entityId === held.body.data.id,
      );
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'APPROVED' })
        .expect(200);

      const after = await account(app, sender.token, sender.savings.id);
      expect(after).toMatchObject({ ledgerBalance: 250_000 * RUPEE, holdAmount: 0 });
      expect((await account(app, receiver.token, receiver.savings.id)).ledgerBalance).toBe(
        250_000 * RUPEE,
      );
      const txn = await http()
        .get(`/api/v1/transactions/${held.body.data.id}`)
        .set(auth(sender.token))
        .expect(200);
      expect(txn.body.data.status).toBe('COMPLETED');
    });

    it('releases the hold when the manager rejects (reason required)', async () => {
      const sender = await customer(300_000);
      const receiver = await customer();
      const ben = await addBeneficiary(app, sender.token, {
        name: 'Rejected Payee',
        accountNumber: receiver.savings.accountNumber,
        ifsc: receiver.savings.ifsc,
      });
      await ageBeneficiary(app, ben.body.data.id);
      const before = new Date();
      const q = await quote(app, sender.token, {
        fromAccountId: sender.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 220_000 * RUPEE,
      }).expect(200);
      const held = await execute(
        app,
        sender.token,
        q.body.data.quoteToken,
        await latestOtp(app, sender.user.id, before),
      ).expect(201);

      const manager = await createStaff(app, Role.MANAGER, 'mgr-rej');
      const queue = await http()
        .get('/api/v1/approvals?status=PENDING&limit=100')
        .set(auth(manager.accessToken));
      const approval = queue.body.data.find(
        (a: { entityId: string }) => a.entityId === held.body.data.id,
      );
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'REJECTED' })
        .expect(400);
      await http()
        .post(`/api/v1/approvals/${approval._id}/decision`)
        .set(auth(manager.accessToken))
        .send({ decision: 'REJECTED', remarks: 'Customer could not be reached to confirm' })
        .expect(200);

      expect(await account(app, sender.token, sender.savings.id)).toMatchObject({
        ledgerBalance: 300_000 * RUPEE,
        holdAmount: 0,
      });
      const txn = await http()
        .get(`/api/v1/transactions/${held.body.data.id}`)
        .set(auth(sender.token));
      expect(txn.body.data).toMatchObject({
        status: 'REJECTED',
        failureReason: expect.stringContaining('could not be reached'),
      });
    });

    it('sends a risky transfer (new payee, KYC pending, new account) for review based on its risk score', async () => {
      const reg = await registerCustomer(app); // KYC stays pending
      const [savings] = await myAccounts(app, reg.accessToken);
      await fund(app, savings.id, 60_000);
      const other = await customer();
      const ben = await addBeneficiary(app, reg.accessToken, {
        name: 'Fresh Payee',
        accountNumber: other.savings.accountNumber,
        ifsc: other.savings.ifsc,
      });
      const q = await quote(app, reg.accessToken, {
        fromAccountId: savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        amount: 50_000 * RUPEE,
      }).expect(200);
      expect(q.body.data.risk.level).toMatch(/HIGH|CRITICAL/);
      expect(q.body.data.approvalRequired).toBe(true);
      expect(q.body.data.risk.reasons).toEqual(
        expect.arrayContaining(['Payee was added less than an hour ago', 'KYC not yet verified']),
      );
    });
  });

  describe('external rails', () => {
    it('settles NEFT in a batch and refunds a returned NEFT', async () => {
      const c = await customer(50_000);
      const good = await addBeneficiary(app, c.token, {
        name: 'Hdfc Payee',
        accountNumber: '50100234567812',
        ifsc: 'HDFC0000240',
      }).expect(201);
      expect(good.body.data).toMatchObject({ isInternal: false, bankName: 'HDFC Bank' }); // offline directory fallback in tests
      const bad = await addBeneficiary(app, c.token, {
        name: 'Closed Account',
        accountNumber: '002201550000',
        ifsc: 'ICIC0000001',
      }).expect(201);
      await ageBeneficiary(app, good.body.data.id);
      await ageBeneficiary(app, bad.body.data.id);

      const send = async (beneficiaryId: string, amount: number) => {
        const before = new Date();
        const q = await quote(app, c.token, {
          fromAccountId: c.savings.id,
          mode: 'BENEFICIARY',
          beneficiaryId,
          rail: 'NEFT',
          amount,
        }).expect(200);
        expect(q.body.data).toMatchObject({ rail: 'NEFT', settlement: 'DEFERRED', fee: 0 });
        return (
          await execute(
            app,
            c.token,
            q.body.data.quoteToken,
            await latestOtp(app, c.user.id, before),
          ).expect(201)
        ).body.data;
      };
      const ok = await send(good.body.data.id, 4_000 * RUPEE);
      const returned = await send(bad.body.data.id, 1_000 * RUPEE);
      expect(ok.status).toBe('PROCESSING');
      expect((await account(app, c.token, c.savings.id)).ledgerBalance).toBe(45_000 * RUPEE);

      const settled = await app.get(SettlementService).settleDue(new Date(Date.now() + 60_000));
      expect(settled).toBeGreaterThanOrEqual(2);

      const okTxn = await http().get(`/api/v1/transactions/${ok.id}`).set(auth(c.token));
      const returnedTxn = await http()
        .get(`/api/v1/transactions/${returned.id}`)
        .set(auth(c.token));
      expect(okTxn.body.data.status).toBe('COMPLETED');
      expect(returnedTxn.body.data).toMatchObject({
        status: 'REVERSED',
        failureReason: expect.stringContaining('account closed'),
      });
      expect((await account(app, c.token, c.savings.id)).ledgerBalance).toBe(46_000 * RUPEE);
    });

    it('charges IMPS fees with GST and enforces RTGS minimum', async () => {
      const c = await customer(20_000);
      const ben = await addBeneficiary(app, c.token, {
        name: 'Imps Payee',
        accountNumber: '50100234567812',
        ifsc: 'HDFC0000240',
      });
      await ageBeneficiary(app, ben.body.data.id);
      const imps = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        rail: 'IMPS',
        amount: 5_000 * RUPEE,
      }).expect(200);
      expect(imps.body.data).toMatchObject({ fee: 590, total: 5_000 * RUPEE + 590 });
      const rtgs = await quote(app, c.token, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        rail: 'RTGS',
        amount: 5_000 * RUPEE,
      }).expect(422);
      expect(rtgs.body.error.message).toContain('RTGS');
    });
  });

  describe('statements and dashboard', () => {
    it('exports CSV statements and builds the dashboard overview', async () => {
      const c = await customer(12_345);
      const csv = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.csv`)
        .set(auth(c.token))
        .expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('attachment');
      expect(csv.text).toContain('"Date","Reference","Narration"');
      expect(csv.text).toContain('"12345.00"');

      const overview = await http().get('/api/v1/accounts/overview').set(auth(c.token)).expect(200);
      expect(overview.body.data.totalBalance).toBe(12_345 * RUPEE);
      expect(overview.body.data.cashflow).toHaveLength(6);
      expect(overview.body.data.recent[0]).toMatchObject({ direction: 'CREDIT' });
    });
  });
});
