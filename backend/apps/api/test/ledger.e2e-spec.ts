import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { createStaff, registerCustomer } from './utils/auth-helpers';
import { auth, fund, myAccounts, RUPEE, verifyKyc } from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

interface TrialBalanceRow {
  code: string;
  debit: number;
  credit: number;
}

describe('General ledger in SQL (e2e)', () => {
  let app: NestExpressApplication;
  let teller: { accessToken: string };
  let manager: { accessToken: string };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teller = await createStaff(app, Role.TELLER, 'ledger.teller');
    manager = await createStaff(app, Role.MANAGER, 'ledger.manager');
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
  });

  async function customer() {
    const reg = await registerCustomer(app);
    await verifyKyc(app, reg.user.id);
    const [savings] = await myAccounts(app, reg.accessToken);
    return { ...reg, savings };
  }

  const cash = (kind: 'deposit' | 'withdrawal', accountNumber: string, rupees: number) =>
    http()
      .post(`/api/v1/staff/cash/${kind}`)
      .set(auth(teller.accessToken))
      .set('Idempotency-Key', randomUUID())
      .send({ accountNumber, amount: rupees * RUPEE })
      .expect(201);

  it('posts balanced double entries and reconciles every customer account', async () => {
    const a = await customer();
    const b = await customer();
    await cash('deposit', a.savings.accountNumber, 10_000);
    await cash('deposit', b.savings.accountNumber, 5_000);
    await cash('withdrawal', a.savings.accountNumber, 1_000);

    const tb = await http()
      .get('/api/v1/ledger/trial-balance')
      .set(auth(manager.accessToken))
      .expect(200);
    expect(tb.body.data.balanced).toBe(true);
    const row = (code: string) => tb.body.data.rows.find((r: TrialBalanceRow) => r.code === code);
    expect(row('1001')).toMatchObject({ debit: 15_000 * RUPEE, credit: 1_000 * RUPEE }); // cash in vaults
    expect(row('2001')).toMatchObject({ debit: 1_000 * RUPEE, credit: 15_000 * RUPEE }); // savings deposits

    const rec = await http()
      .get('/api/v1/ledger/reconciliation')
      .set(auth(manager.accessToken))
      .expect(200);
    expect(rec.body.data.pendingTransactions).toBe(0);
    const mismatched = rec.body.data.mismatches.map(
      (m: { accountNumber: string }) => m.accountNumber,
    );
    expect(mismatched).not.toContain(a.savings.accountNumber);
    expect(mismatched).not.toContain(b.savings.accountNumber);

    const journal = await http()
      .get('/api/v1/ledger/journal?limit=5')
      .set(auth(manager.accessToken))
      .expect(200);
    const latest = journal.body.data.items[0];
    expect(latest.transactionType).toBe('CASH_WITHDRAWAL');
    const debits = latest.lines.reduce((s: number, l: TrialBalanceRow) => s + l.debit, 0);
    const credits = latest.lines.reduce((s: number, l: TrialBalanceRow) => s + l.credit, 0);
    expect(debits).toBe(credits);
  });

  it('flags a balance that changed without a transaction', async () => {
    const c = await customer();
    await fund(app, c.savings.id, 750); // writes the balance directly, bypassing the transaction engine
    const rec = await http()
      .get('/api/v1/ledger/reconciliation')
      .set(auth(manager.accessToken))
      .expect(200);
    const mismatch = rec.body.data.mismatches.find(
      (m: { accountNumber: string }) => m.accountNumber === c.savings.accountNumber,
    );
    expect(mismatch).toMatchObject({
      coreBalance: 750 * RUPEE,
      ledgerBalance: 0,
      difference: 750 * RUPEE,
    });
  });

  it('posts each transaction exactly once', async () => {
    const d = await customer();
    await cash('deposit', d.savings.accountNumber, 2_000);
    const first = await http()
      .post('/api/v1/ledger/sync')
      .set(auth(manager.accessToken))
      .expect(200);
    expect(first.body.data.posted).toBeGreaterThanOrEqual(1);
    const second = await http()
      .post('/api/v1/ledger/sync')
      .set(auth(manager.accessToken))
      .expect(200);
    expect(second.body.data).toMatchObject({ posted: 0, reversed: 0 });
  });

  it('is for managers and administrators only', async () => {
    const e = await customer();
    await http().get('/api/v1/ledger/trial-balance').set(auth(e.accessToken)).expect(403);
    await http().get('/api/v1/ledger/trial-balance').set(auth(teller.accessToken)).expect(403);
  });
});
