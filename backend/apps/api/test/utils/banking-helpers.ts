import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { Category, Channel, PostingDirection } from '../../src/common/enums/banking.enums';
import { Account } from '../../src/modules/accounts/schemas/account.schema';
import { Posting } from '../../src/modules/accounts/schemas/posting.schema';
import { Beneficiary } from '../../src/modules/beneficiaries/beneficiary.schema';
import {
  Notification,
  NotificationType,
} from '../../src/modules/notifications/notification.schema';
import { KycStatus, User } from '../../src/modules/users/user.schema';

export const RUPEE = 100;

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function myAccounts(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .get('/api/v1/accounts')
    .set(auth(token))
    .expect(200);
  return res.body.data as {
    id: string;
    accountNumber: string;
    ifsc: string;
    availableBalance: number;
    ledgerBalance: number;
    holdAmount: number;
    status: string;
    type: string;
  }[];
}

export async function account(app: INestApplication, token: string, id: string) {
  const res = await request(app.getHttpServer())
    .get(`/api/v1/accounts/${id}`)
    .set(auth(token))
    .expect(200);
  return res.body.data as { availableBalance: number; ledgerBalance: number; holdAmount: number };
}

/** Test-only shortcut: credits an account directly (cash deposits arrive in a later phase). */
export async function fund(
  app: INestApplication,
  accountId: string,
  rupees: number,
  narration = 'Test funding',
): Promise<void> {
  const accounts = app.get<Model<Account>>(getModelToken(Account.name));
  const postings = app.get<Model<Posting>>(getModelToken(Posting.name));
  const updated = await accounts.findByIdAndUpdate(
    accountId,
    { $inc: { ledgerBalance: rupees * RUPEE } },
    { new: true },
  );
  await postings.create({
    accountId,
    transactionId: new Types.ObjectId(),
    reference: `TEST${Date.now()}`,
    direction: PostingDirection.CREDIT,
    amount: rupees * RUPEE,
    balanceAfter: updated!.ledgerBalance,
    narration,
    category: Category.OTHER,
    channel: Channel.BRANCH,
  });
}

export async function verifyKyc(app: INestApplication, userId: string): Promise<void> {
  const users = app.get<Model<User>>(getModelToken(User.name));
  await users.updateOne({ _id: userId }, { $set: { 'kyc.status': KycStatus.VERIFIED } });
}

/** Makes a payee look old (past its cooling period) for tests. */
export async function ageBeneficiary(app: INestApplication, beneficiaryId: string): Promise<void> {
  const beneficiaries = app.get<Model<Beneficiary>>(getModelToken(Beneficiary.name));
  const old = new Date(Date.now() - 30 * 86_400_000);
  await beneficiaries.collection.updateOne(
    { _id: new Types.ObjectId(beneficiaryId) },
    { $set: { createdAt: old, coolingUntil: old } },
  );
}

/** Reads the simulated SMS OTP from the user's notification centre. */
export async function latestOtp(
  app: INestApplication,
  userId: string,
  after: Date,
): Promise<string> {
  const notifications = app.get<Model<Notification>>(getModelToken(Notification.name));
  for (let i = 0; i < 40; i++) {
    const otp = await notifications
      .findOne({ userId, type: NotificationType.OTP, createdAt: { $gte: after } })
      .sort({ createdAt: -1 })
      .lean();
    const code = otp?.message.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('No OTP notification received');
}

export async function waitForNotification(
  app: INestApplication,
  userId: string,
  titlePart: string,
) {
  const notifications = app.get<Model<Notification>>(getModelToken(Notification.name));
  for (let i = 0; i < 40; i++) {
    const found = await notifications.findOne({ userId, title: new RegExp(titlePart, 'i') }).lean();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Notification "${titlePart}" not received`);
}

/** Returns the supertest request itself (chainable with .expect()). */
export function addBeneficiary(
  app: INestApplication,
  token: string,
  payload: { name: string; accountNumber: string; ifsc: string },
) {
  return request(app.getHttpServer())
    .post('/api/v1/beneficiaries')
    .set(auth(token))
    .send({ ...payload, confirmAccountNumber: payload.accountNumber });
}

export interface TransferInput {
  fromAccountId: string;
  mode: 'OWN' | 'BENEFICIARY';
  toAccountId?: string;
  beneficiaryId?: string;
  rail?: 'IMPS' | 'NEFT' | 'RTGS';
  amount: number;
  remarks?: string;
}

export function quote(app: INestApplication, token: string, input: TransferInput) {
  return request(app.getHttpServer()).post('/api/v1/transfers/quote').set(auth(token)).send(input);
}

export function execute(
  app: INestApplication,
  token: string,
  quoteToken: string,
  otp?: string,
  key = randomUUID(),
) {
  return request(app.getHttpServer())
    .post('/api/v1/transfers')
    .set(auth(token))
    .set('Idempotency-Key', key)
    .send({ quoteToken, ...(otp ? { otp } : {}) });
}
