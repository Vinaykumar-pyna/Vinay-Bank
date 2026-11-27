import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createClientAsync, WSSecurity } from 'soap';
import request from 'supertest';
import { registerCustomer } from './utils/auth-helpers';
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
} from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

const SOAP_PASSWORD = randomBytes(18).toString('base64url');
const PARTNER_EMAIL = `erp.partner.${Date.now()}@example.com`;
process.env.SOAP_USERNAME = 'erp-partner';
process.env.SOAP_PASSWORD = SOAP_PASSWORD;
process.env.SOAP_CUSTOMER_EMAIL = PARTNER_EMAIL;

interface Payee {
  id: string;
  amount: string;
  ifsc: string;
  name: string;
  account: string;
}

function painFile(
  messageId: string,
  debtorAccount: string,
  payees: Payee[],
  controlSum?: string,
  prolog = '<?xml version="1.0" encoding="UTF-8"?>',
) {
  const sum = controlSum ?? payees.reduce((s, p) => s + Number(p.amount), 0).toFixed(2);
  return `${prolog}
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr><MsgId>${messageId}</MsgId><CreDtTm>2026-11-14T09:30:00</CreDtTm><NbOfTxs>${payees.length}</NbOfTxs><CtrlSum>${sum}</CtrlSum><InitgPty><Nm>Test Studio</Nm></InitgPty></GrpHdr>
    <PmtInf>
      <PmtInfId>P1</PmtInfId><PmtMtd>TRF</PmtMtd><ReqdExctnDt>2026-11-14</ReqdExctnDt>
      <Dbtr><Nm>Test</Nm></Dbtr><DbtrAcct><Id><Othr><Id>${debtorAccount}</Id></Othr></Id></DbtrAcct>
      ${payees
        .map(
          (
            p,
          ) => `<CdtTrfTxInf><PmtId><EndToEndId>${p.id}</EndToEndId></PmtId><Amt><InstdAmt Ccy="INR">${p.amount}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>${p.ifsc}</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${p.name}</Nm></Cdtr><CdtrAcct><Id><Othr><Id>${p.account}</Id></Othr></Id></CdtrAcct></CdtTrfTxInf>`,
        )
        .join('')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

/** SOAP 1.1 envelope with a WS-Security UsernameToken (PasswordDigest). */
function soapEnvelope(
  body: string,
  options: { password?: string; nonce?: Buffer; created?: string } = {},
) {
  const nonce = options.nonce ?? randomBytes(16);
  const created = options.created ?? new Date().toISOString();
  const digest = createHash('sha1')
    .update(
      Buffer.concat([nonce, Buffer.from(created), Buffer.from(options.password ?? SOAP_PASSWORD)]),
    )
    .digest('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vb="urn:vinaybank:soap:banking:1"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
  xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <soap:Header>
    <wsse:Security soap:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>erp-partner</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</wsse:Nonce>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

describe('Integrations: SOAP, XML/XSLT, ISO 20022 and forex (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
  });

  async function customer(rupees: number, email?: string) {
    const reg = await registerCustomer(app, email ? { email } : {});
    await verifyKyc(app, reg.user.id);
    const [savings] = await myAccounts(app, reg.accessToken);
    if (rupees) await fund(app, savings.id, rupees);
    return { ...reg, savings };
  }

  describe('SOAP partner service (WSDL + WS-Security)', () => {
    let partner: Awaited<ReturnType<typeof customer>>;
    beforeAll(async () => {
      // Three postings adding up to Rs 25,000, so the mini statement's Count can be checked.
      partner = await customer(20_000, PARTNER_EMAIL);
      await fund(app, partner.savings.id, 3_000);
      await fund(app, partner.savings.id, 2_000);
    });

    const post = (envelope: string, action: string) =>
      http()
        .post('/soap/banking')
        .set('Content-Type', 'text/xml; charset=utf-8')
        .set('SOAPAction', `"urn:vinaybank:soap:banking:1#${action}"`)
        .send(envelope);

    it('publishes the WSDL', async () => {
      const res = await http().get('/soap/banking?wsdl').expect(200);
      expect(res.text).toContain('<definitions');
      expect(res.text).toContain('name="GetAccountBalance"');
      expect(res.text).toContain('[0-9]{12}');
    });

    it('returns a balance for a signed request', async () => {
      const body = `<vb:GetAccountBalanceRequest><vb:AccountNumber>${partner.savings.accountNumber}</vb:AccountNumber></vb:GetAccountBalanceRequest>`;
      const res = await post(soapEnvelope(body), 'GetAccountBalance').expect(200);
      expect(res.text).toMatch(/<\w*:?AvailableBalance>25000\.00</);
      expect(res.text).toContain(partner.savings.accountNumber);
    });

    it('returns a mini statement with the requested number of entries, newest first', async () => {
      const body = `<vb:GetMiniStatementRequest><vb:AccountNumber>${partner.savings.accountNumber}</vb:AccountNumber><vb:Count>2</vb:Count></vb:GetMiniStatementRequest>`;
      const res = await post(soapEnvelope(body), 'GetMiniStatement').expect(200);
      expect(res.text).toContain('Test funding');
      // Count is an xsd:int, which node-soap hands over as a number
      expect(res.text.match(/<(?:\w+:)?Entry>/g)).toHaveLength(2);
      expect(res.text).toMatch(/<(?:\w+:)?BalanceAfter>25000\.00</);
      expect(res.text).not.toMatch(/<(?:\w+:)?BalanceAfter>20000\.00</);
    });

    it('works with a client generated from the WSDL (node-soap, PasswordDigest)', async () => {
      const server = app.getHttpServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/soap/banking`;
        const client = await createClientAsync(`${url}?wsdl`, { endpoint: url });
        client.setSecurity(
          new WSSecurity('erp-partner', SOAP_PASSWORD, {
            passwordType: 'PasswordDigest',
            hasNonce: true,
          }),
        );
        const call = (operation: string, args: Record<string, unknown>) =>
          (client[`${operation}Async`] as (a: object) => Promise<[Record<string, unknown>]>)(args);

        const [balance] = await call('GetAccountBalance', {
          AccountNumber: partner.savings.accountNumber,
        });
        expect(Number(balance.AvailableBalance)).toBe(25000);
        expect(balance.AsOf).toBeInstanceOf(Date); // typed by the XSD

        const [statement] = await call('GetMiniStatement', {
          AccountNumber: partner.savings.accountNumber,
          Count: 1,
        });
        expect(([] as unknown[]).concat(statement.Entry)).toHaveLength(1);

        // The same signed envelope sent again is a replay
        const replay = await http()
          .post('/soap/banking')
          .set('Content-Type', 'text/xml; charset=utf-8')
          .set('SOAPAction', '"urn:vinaybank:soap:banking:1#GetMiniStatement"')
          .send(client.lastRequest);
        expect(replay.status).toBe(401);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('rejects a wrong password, a replayed nonce and a stale timestamp', async () => {
      const body = `<vb:GetAccountBalanceRequest><vb:AccountNumber>${partner.savings.accountNumber}</vb:AccountNumber></vb:GetAccountBalanceRequest>`;
      const wrong = await post(
        soapEnvelope(body, { password: 'not-the-password' }),
        'GetAccountBalance',
      );
      expect(wrong.status).toBe(401);
      expect(wrong.text).toContain('Invalid username or password');

      const nonce = randomBytes(16);
      await post(soapEnvelope(body, { nonce }), 'GetAccountBalance').expect(200);
      const replay = await post(soapEnvelope(body, { nonce }), 'GetAccountBalance');
      expect(replay.status).toBe(401);

      const stale = await post(
        soapEnvelope(body, { created: new Date(Date.now() - 3_600_000).toISOString() }),
        'GetAccountBalance',
      );
      expect(stale.status).toBe(401);
    });

    it("only shows the partner's own customer accounts", async () => {
      const other = await customer(1_000);
      const body = `<vb:GetAccountBalanceRequest><vb:AccountNumber>${other.savings.accountNumber}</vb:AccountNumber></vb:GetAccountBalanceRequest>`;
      const res = await post(soapEnvelope(body), 'GetAccountBalance');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.text).toContain('Account not found for this partner');
    });
  });

  describe('XML statement and XSLT', () => {
    it('exports the statement as XML and renders it to HTML with XSLT', async () => {
      const c = await customer(12_345);
      const xml = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.xml`)
        .set(auth(c.accessToken))
        .expect(200);
      expect(xml.headers['content-type']).toContain('application/xml');
      expect(xml.text).toContain('<Statement');
      expect(xml.text).toMatch(/<Amount formatted="[^"]+">12345\.00<\/Amount>/);
      expect(xml.text).toContain(`number="${c.savings.accountNumber}"`);

      const html = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.html`)
        .set(auth(c.accessToken))
        .expect(200);
      expect(html.headers['content-type']).toContain('text/html');
      expect(html.text).toContain('account statement');
      expect(html.text).toContain('Test funding');

      const stranger = await customer(0);
      await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.xml`)
        .set(auth(stranger.accessToken))
        .expect((res) => expect([403, 404]).toContain(res.status));
    });

    it('escapes markup from narrations and locks the printable page down', async () => {
      const c = await customer(500);
      // Narrations can carry text typed by someone else, such as a sender's transfer remark
      await fund(app, c.savings.id, 1, '<img src=x onerror=alert(1)> & co');

      const xml = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.xml`)
        .set(auth(c.accessToken))
        .expect(200);
      expect(xml.text).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; co');

      const html = await http()
        .get(`/api/v1/accounts/${c.savings.id}/statement.html`)
        .set(auth(c.accessToken))
        .expect(200);
      expect(html.text).not.toMatch(/<img/i);
      expect(html.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
      // Opened from a blob: URL by the web app, so the page brings its own policy
      expect(html.text).toMatch(
        /<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*"/,
      );
    });
  });

  describe('ISO 20022 pain.001 bulk payments', () => {
    it('previews, approves with an OTP and pays a whole file atomically', async () => {
      const payer = await customer(1_00_000);
      const payee = await customer(0);
      const sample = await http()
        .get(`/api/v1/bulk-payments/sample?accountId=${payer.savings.id}`)
        .set(auth(payer.accessToken))
        .expect(200);
      expect(sample.text).toContain('pain.001.001.03');

      const xml = painFile(`SAL-${Date.now()}`, payer.savings.accountNumber, [
        {
          id: 'E2E-1',
          amount: '20000.00',
          ifsc: 'HDFC0000240',
          name: 'Amit Kulkarni',
          account: '50100234567812',
        },
        {
          id: 'E2E-2',
          amount: '15000.50',
          ifsc: payee.savings.ifsc,
          name: 'Internal Payee',
          account: payee.savings.accountNumber,
        },
      ]);
      const since = new Date();
      const preview = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({ xml })
        .expect(200);
      expect(preview.body.data).toMatchObject({
        valid: true,
        totals: { count: 2, amount: 3_500_050, internal: 1, neft: 1 },
      });
      const otp = await latestOtp(app, payer.user.id, since);

      const key = randomUUID();
      const submit = () =>
        http()
          .post('/api/v1/bulk-payments')
          .set(auth(payer.accessToken))
          .set('Idempotency-Key', key)
          .send({ xml, challengeId: preview.body.data.otp.challengeId, otp });
      const paid = await submit().expect(201);
      expect(paid.body.data.payments).toHaveLength(2);
      expect((await account(app, payer.accessToken, payer.savings.id)).ledgerBalance).toBe(
        1_00_000 * RUPEE - 3_500_050,
      );
      expect((await account(app, payee.accessToken, payee.savings.id)).ledgerBalance).toBe(
        1_500_050,
      );
      // A network retry with the same key returns the same result without paying twice.
      const retry = await submit().expect(200);
      expect(retry.body.data.batchId).toBe(paid.body.data.batchId);

      const again = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({ xml })
        .expect(200);
      expect(again.body.data.valid).toBe(false);
      expect(again.body.data.issues[0].path).toBe('GrpHdr/MsgId');
    });

    it('checks every Vinay Bank payee in the file (one lookup for all lines)', async () => {
      const payer = await customer(10_000);
      const payee = await customer(0);
      const line = (id: string, number: string): Payee => ({
        id,
        amount: '100.00',
        ifsc: payee.savings.ifsc,
        name: 'Internal Payee',
        account: number,
      });
      const xml = painFile(`CHK-${Date.now()}`, payer.savings.accountNumber, [
        line('OK-1', payee.savings.accountNumber),
        line('OK-2', payee.savings.accountNumber), // the same payee twice is allowed
        line('MISSING', '000299999999'),
        line('SELF', payer.savings.accountNumber),
      ]);
      const preview = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({ xml })
        .expect(200);
      expect(preview.body.data.valid).toBe(false);
      expect(preview.body.data.totals).toMatchObject({ count: 4, internal: 4, neft: 0 });
      const issues = preview.body.data.issues as { message: string; path: string }[];
      expect(issues.map((issue) => issue.message)).toEqual([
        'No active Vinay Bank account has this number',
        'A payment cannot go to the debit account itself',
      ]);
      expect(issues[0].path).toMatch(/^CdtTrfTxInf\[\d+\]\/CdtrAcct$/);
    });

    it('rejects files whose control totals or balance do not add up', async () => {
      const payer = await customer(10_000);
      const payees: Payee[] = [
        {
          id: 'X1',
          amount: '500.00',
          ifsc: 'SBIN0001234',
          name: 'Suresh Patil',
          account: '30012345678',
        },
      ];
      const badSum = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({ xml: painFile('BAD-SUM', payer.savings.accountNumber, payees, '900.00') })
        .expect(200);
      expect(badSum.body.data.valid).toBe(false);
      expect(badSum.body.data.issues.map((i: { path: string }) => i.path)).toContain(
        'GrpHdr/CtrlSum',
      );

      const tooMuch = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({
          xml: painFile('TOO-MUCH', payer.savings.accountNumber, [
            { ...payees[0], amount: '50000.00' },
          ]),
        })
        .expect(200);
      expect(tooMuch.body.data.issues[0].message).toMatch(/available balance/);

      const xxe = await http()
        .post('/api/v1/bulk-payments/preview')
        .set(auth(payer.accessToken))
        .send({
          xml: painFile(
            'XXE',
            payer.savings.accountNumber,
            payees,
            undefined,
            '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/hosts">]>',
          ),
        })
        .expect(200);
      expect(xxe.body.data.issues[0].message).toMatch(/DOCTYPE/);
    });
  });

  describe('banks and the IFSC directory', () => {
    it('lists the banks payees can be added at and pays a Bank of Baroda payee over IMPS', async () => {
      const c = await customer(20_000);
      const banks = await http().get('/api/v1/banks').set(auth(c.accessToken)).expect(200);
      expect(banks.body.data[0]).toMatchObject({ code: 'VINB', isInternal: true });
      expect(banks.body.data).toEqual(
        expect.arrayContaining([
          { code: 'BARB', name: 'Bank of Baroda', exampleIfsc: 'BARB0ANDHER', isInternal: false },
        ]),
      );
      await http().get('/api/v1/banks').expect(401);

      // The IFSC directory is unreachable in tests: the bank is named from its IFSC code.
      const ifsc = await http()
        .get('/api/v1/ifsc/BARB0ANDHER')
        .set(auth(c.accessToken))
        .expect(200);
      expect(ifsc.body.data).toMatchObject({ bank: 'Bank of Baroda', source: 'OFFLINE' });

      const ben = await addBeneficiary(app, c.accessToken, {
        name: 'Neha Joshi',
        accountNumber: '29080100004567',
        ifsc: 'BARB0ANDHER',
      }).expect(201);
      expect(ben.body.data).toMatchObject({ bankName: 'Bank of Baroda', isInternal: false });
      await ageBeneficiary(app, ben.body.data.id);

      const before = new Date();
      const q = await quote(app, c.accessToken, {
        fromAccountId: c.savings.id,
        mode: 'BENEFICIARY',
        beneficiaryId: ben.body.data.id,
        rail: 'IMPS',
        amount: 2_500 * RUPEE,
      }).expect(200);
      expect(q.body.data.payee).toMatchObject({ bankName: 'Bank of Baroda', ifsc: 'BARB0ANDHER' });
      const paid = await execute(
        app,
        c.accessToken,
        q.body.data.quoteToken,
        await latestOtp(app, c.user.id, before),
      ).expect(201);
      expect(paid.body.data).toMatchObject({ status: 'COMPLETED', rail: 'IMPS' });
      expect(paid.body.data.to).toMatchObject({ bankName: 'Bank of Baroda' });
    });
  });

  describe('foreign exchange', () => {
    it('serves indicative rates when the live source is unreachable', async () => {
      const c = await customer(0);
      const res = await http().get('/api/v1/forex/rates').set(auth(c.accessToken)).expect(200);
      expect(res.body.data.source).toBe('OFFLINE');
      expect(
        res.body.data.rates.find((r: { currency: string }) => r.currency === 'USD').rupeesPerUnit,
      ).toBeGreaterThan(50);
    });
  });
});
