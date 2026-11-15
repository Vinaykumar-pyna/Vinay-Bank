import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { connect } from 'node:tls';
import request from 'supertest';
import {
  clientTlsOptions,
  frame,
  FrameDecoder,
  pack,
  packWithMac,
  unpack,
  type IsoMessage,
} from '@app/shared';
import { CardSwitchModule } from '../../card-switch/src/card-switch.module';
import { registerCustomer } from './utils/auth-helpers';
import {
  account,
  auth,
  fund,
  latestOtp,
  myAccounts,
  RUPEE,
  verifyKyc,
} from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

interface CardView {
  id: string;
  maskedPan: string;
  status: string;
  pinSet: boolean;
  pinLocked: boolean;
}

describe('Cards and the ISO 8583 card network (e2e)', () => {
  let app: NestExpressApplication;
  let cardSwitch: INestApplicationContext;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ cardNetwork: true });
    cardSwitch = await NestFactory.createApplicationContext(CardSwitchModule, { logger: false });
  });

  afterAll(async () => {
    await cardSwitch.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
  });

  /** A KYC-verified customer with a funded savings account, a card and a PIN. */
  async function cardholder(rupees = 50_000, pin = '4826') {
    const reg = await registerCustomer(app);
    await verifyKyc(app, reg.user.id);
    const [savings] = await myAccounts(app, reg.accessToken);
    await fund(app, savings.id, rupees);
    const issued = await http()
      .post('/api/v1/cards')
      .set(auth(reg.accessToken))
      .send({ accountId: savings.id })
      .expect(201);
    const card = issued.body.data as CardView;
    const pan = await reveal(reg.accessToken, reg.user.id, card.id).then((d) => d.pan);
    await setPin(reg.accessToken, reg.user.id, card.id, pin);
    return {
      ...reg,
      savings,
      card,
      pan,
      expiry: (await reveal(reg.accessToken, reg.user.id, card.id)).expiry,
    };
  }

  async function otpFor(token: string, userId: string, cardId: string, purpose: 'REVEAL' | 'PIN') {
    const since = new Date();
    const challenge = await http()
      .post(`/api/v1/cards/${cardId}/otp`)
      .set(auth(token))
      .send({ purpose })
      .expect(200);
    return {
      challengeId: challenge.body.data.challengeId as string,
      otp: await latestOtp(app, userId, since),
    };
  }

  async function reveal(token: string, userId: string, cardId: string) {
    const proof = await otpFor(token, userId, cardId, 'REVEAL');
    const res = await http()
      .post(`/api/v1/cards/${cardId}/reveal`)
      .set(auth(token))
      .send(proof)
      .expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    return res.body.data as Record<string, string>;
  }

  async function setPin(token: string, userId: string, cardId: string, pin: string) {
    const proof = await otpFor(token, userId, cardId, 'PIN');
    return http()
      .post(`/api/v1/cards/${cardId}/pin`)
      .set(auth(token))
      .send({ ...proof, pin });
  }

  function simulate(body: Record<string, unknown>) {
    return http()
      .post('/api/v1/simulator/card-network')
      .send({ terminal: 'ATM', ...body })
      .expect(200);
  }

  /** Sends raw bytes to the switch over mutual TLS and returns the first response frame. */
  function rawExchange(payload: Buffer): Promise<IsoMessage> {
    const options = clientTlsOptions({
      ca: readFileSync(process.env.TLS_CA_PATH!, 'utf8'),
      cert: readFileSync(process.env.TLS_CLIENT_CERT_PATH!, 'utf8'),
      key: readFileSync(process.env.TLS_CLIENT_KEY_PATH!, 'utf8'),
    });
    return new Promise((resolve, reject) => {
      const socket = connect({
        host: '127.0.0.1',
        port: Number(process.env.CARD_SWITCH_PORT),
        ...options,
      });
      const decoder = new FrameDecoder();
      socket.once('secureConnect', () => socket.write(frame(payload)));
      socket.on('data', (chunk: Buffer) => {
        const [first] = decoder.push(chunk);
        if (first) {
          socket.end();
          resolve(unpack(first));
        }
      });
      socket.on('error', reject);
    });
  }

  describe('card management', () => {
    it('issues one virtual card per account to KYC-verified customers only', async () => {
      const pending = await registerCustomer(app);
      const [acct] = await myAccounts(app, pending.accessToken);
      const refused = await http()
        .post('/api/v1/cards')
        .set(auth(pending.accessToken))
        .send({ accountId: acct.id })
        .expect(403);
      expect(refused.body.error.code).toBe('KYC_REQUIRED');

      await verifyKyc(app, pending.user.id);
      const issued = await http()
        .post('/api/v1/cards')
        .set(auth(pending.accessToken))
        .send({ accountId: acct.id })
        .expect(201);
      expect(issued.body.data).toMatchObject({ status: 'ACTIVE', pinSet: false, network: 'RUPAY' });
      expect(issued.body.data.maskedPan).toMatch(/^6528 45XX XXXX \d{4}$/);
      expect(JSON.stringify(issued.body.data)).not.toMatch(
        /panEncrypted|pinVerificationValue|cvv/i,
      );
      await http()
        .post('/api/v1/cards')
        .set(auth(pending.accessToken))
        .send({ accountId: acct.id })
        .expect(409);
    });

    it('reveals full card details only with an OTP, and refuses weak PINs', async () => {
      const c = await cardholder();
      expect(c.pan).toMatch(/^652845\d{10}$/);
      const details = await reveal(c.accessToken, c.user.id, c.card.id);
      expect(details.cvv).toMatch(/^\d{3}$/);
      await http()
        .post(`/api/v1/cards/${c.card.id}/reveal`)
        .set(auth(c.accessToken))
        .send({ challengeId: '0123456789abcdef01234567', otp: '000000' })
        .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));
      const weak = await setPin(c.accessToken, c.user.id, c.card.id, '1234');
      expect(weak.status).toBe(400);
    });
  });

  describe('ATM and POS through the switch', () => {
    it('answers an echo test over mutual TLS', async () => {
      const res = await simulate({ operation: 'ECHO' });
      expect(res.body.data.outcome).toMatchObject({ approved: true, responseCode: '00' });
      expect(res.body.data.exchange.request.mti).toBe('0800');
      expect(res.body.data.exchange.response.mti).toBe('0810');
      expect(res.body.data.exchange.tls.protocol).toMatch(/^TLSv1\.[23]$/);
    });

    it('checks the balance and withdraws cash with the right PIN', async () => {
      const c = await cardholder(50_000);
      const balance = await simulate({
        operation: 'BALANCE',
        pan: c.pan,
        expiry: c.expiry,
        pin: '4826',
      });
      expect(balance.body.data.outcome).toMatchObject({
        approved: true,
        availableBalance: 50_000 * RUPEE,
      });
      // The inspector never shows cardholder data.
      const shown = JSON.stringify(balance.body.data.exchange);
      expect(shown).not.toContain(c.pan);
      expect(shown).toContain(`${c.pan.slice(0, 6)}******${c.pan.slice(-4)}`);

      const cash = await simulate({
        operation: 'WITHDRAWAL',
        pan: c.pan,
        expiry: c.expiry,
        pin: '4826',
        amount: 2_000 * RUPEE,
      });
      expect(cash.body.data.outcome).toMatchObject({
        approved: true,
        responseCode: '00',
        availableBalance: 48_000 * RUPEE,
      });
      expect(cash.body.data.outcome.authCode).toMatch(/^\d{6}$/);
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(48_000 * RUPEE);

      const txns = await http()
        .get('/api/v1/transactions?rail=CARD')
        .set(auth(c.accessToken))
        .expect(200);
      expect(txns.body.data[0]).toMatchObject({
        type: 'ATM_WITHDRAWAL',
        status: 'COMPLETED',
        amount: 2_000 * RUPEE,
      });
    });

    it('locks the PIN after three wrong attempts until a new PIN is set', async () => {
      const c = await cardholder();
      const attempt = (pin: string) =>
        simulate({ operation: 'BALANCE', pan: c.pan, expiry: c.expiry, pin });
      expect((await attempt('1111')).body.data.outcome.responseCode).toBe('55');
      expect((await attempt('2222')).body.data.outcome.responseCode).toBe('55');
      expect((await attempt('3333')).body.data.outcome.responseCode).toBe('75');
      expect((await attempt('4826')).body.data.outcome.responseCode).toBe('75');
      await setPin(c.accessToken, c.user.id, c.card.id, '5937').then((res) =>
        expect(res.status).toBe(200),
      );
      expect((await attempt('5937')).body.data.outcome.responseCode).toBe('00');
    });

    it('declines over the daily ATM limit, over the balance, and for non-multiples of Rs 100', async () => {
      const c = await cardholder(6_000);
      await http()
        .patch(`/api/v1/cards/${c.card.id}/settings`)
        .set(auth(c.accessToken))
        .send({ limits: { atmDaily: 5_000 * RUPEE } })
        .expect(200);
      const withdraw = (amount: number) =>
        simulate({ operation: 'WITHDRAWAL', pan: c.pan, expiry: c.expiry, pin: '4826', amount });
      expect((await withdraw(4_000 * RUPEE)).body.data.outcome.responseCode).toBe('00');
      expect((await withdraw(2_000 * RUPEE)).body.data.outcome.responseCode).toBe('61');
      expect((await withdraw(150 * RUPEE)).body.data.outcome.responseCode).toBe('13');
      await http()
        .patch(`/api/v1/cards/${c.card.id}/settings`)
        .set(auth(c.accessToken))
        .send({ limits: { atmDaily: 50_000 * RUPEE } })
        .expect(200);
      expect((await withdraw(3_000 * RUPEE)).body.data.outcome.responseCode).toBe('51');
    });

    it('reverses a withdrawal the ATM could not dispense', async () => {
      const c = await cardholder(10_000);
      const cash = await simulate({
        operation: 'WITHDRAWAL',
        pan: c.pan,
        expiry: c.expiry,
        pin: '4826',
        amount: 3_000 * RUPEE,
      });
      const { rrn, stan, transmittedAt } = cash.body.data.outcome;
      const reversal = await simulate({
        operation: 'REVERSAL',
        pan: c.pan,
        original: { rrn, stan, transmittedAt, operation: 'WITHDRAWAL', amount: 3_000 * RUPEE },
      });
      expect(reversal.body.data.exchange.request.mti).toBe('0420');
      expect(reversal.body.data.outcome).toMatchObject({ approved: true, responseCode: '00' });
      expect((await account(app, c.accessToken, c.savings.id)).ledgerBalance).toBe(10_000 * RUPEE);
      const txns = await http()
        .get('/api/v1/transactions?rail=CARD')
        .set(auth(c.accessToken))
        .expect(200);
      expect(txns.body.data[0].status).toBe('REVERSED');
    });

    it('honours card blocks, channel controls and unknown cards', async () => {
      const c = await cardholder();
      const balance = () =>
        simulate({ operation: 'BALANCE', pan: c.pan, expiry: c.expiry, pin: '4826' });
      await http()
        .patch(`/api/v1/cards/${c.card.id}/settings`)
        .set(auth(c.accessToken))
        .send({ controls: { atm: false } })
        .expect(200);
      expect((await balance()).body.data.outcome.responseCode).toBe('57');
      await http()
        .patch(`/api/v1/cards/${c.card.id}/settings`)
        .set(auth(c.accessToken))
        .send({ controls: { atm: true } })
        .expect(200);

      await http().post(`/api/v1/cards/${c.card.id}/block`).set(auth(c.accessToken)).expect(200);
      expect((await balance()).body.data.outcome.responseCode).toBe('62');
      await http().post(`/api/v1/cards/${c.card.id}/unblock`).set(auth(c.accessToken)).expect(200);
      expect((await balance()).body.data.outcome.responseCode).toBe('00');

      await http()
        .post(`/api/v1/cards/${c.card.id}/hotlist`)
        .set(auth(c.accessToken))
        .send({ reason: 'STOLEN' })
        .expect(200);
      expect((await balance()).body.data.outcome.responseCode).toBe('41');

      const unknown = await simulate({
        operation: 'BALANCE',
        pan: '6528451999999999',
        expiry: c.expiry,
        pin: '4826',
      });
      expect(unknown.body.data.outcome.responseCode).toBe('14');
    });

    it('rejects a message whose MAC does not verify, without reaching the issuer', async () => {
      const echo: IsoMessage = {
        mti: '0800',
        fields: { 7: '1114101530', 11: '424242', 70: '301' },
      };
      const forged = packWithMac(echo, Buffer.alloc(32, 7)); // signed with the wrong key
      const response = await rawExchange(forged);
      expect(response.mti).toBe('0810');
      expect(response.fields[39]).toBe('63');
      const unsigned = await rawExchange(pack(echo));
      expect(unsigned.fields[39]).toBe('63');
    });

    it('refuses TLS clients without a certificate from our CA', async () => {
      await expect(
        new Promise((resolve, reject) => {
          const socket = connect({
            host: '127.0.0.1',
            port: Number(process.env.CARD_SWITCH_PORT),
            ca: readFileSync(process.env.TLS_CA_PATH!, 'utf8'),
            servername: 'localhost',
          });
          socket.on('data', resolve);
          socket.on('error', reject);
          socket.once('secureConnect', () =>
            socket.write(frame(pack({ mti: '0800', fields: { 11: '000001', 70: '301' } }))),
          );
        }),
      ).rejects.toThrow();
    });
  });
});
