import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import request from 'supertest';
import { Role } from '../../src/common/enums/role.enum';
import { User } from '../../src/modules/users/user.schema';

export const XHR = { 'X-Requested-With': 'XMLHttpRequest' };
export const TEST_PASSWORD = 'Str0ng@Pass';

let counter = 0;

/** Unique, valid registration payload (PAN, phone and email never collide between tests). */
export function registrationPayload(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const n = String(counter).padStart(4, '0');
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pan = `AB${letters[counter % 26]}P${letters[(counter * 7) % 26]}${n}${letters[(counter * 3) % 26]}`;
  return {
    firstName: 'Test',
    lastName: `Tester ${letters[counter % 26]}${letters[(counter * 5) % 26]}`,
    email: `user${n}.${Date.now()}@example.com`,
    phone: `98${String(Date.now()).slice(-4)}${n}`,
    password: TEST_PASSWORD,
    dateOfBirth: '1995-06-15',
    pan,
    address: { line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    acceptTerms: true,
    ...overrides,
  };
}

export function refreshCookieFrom(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('vb_refresh='));
  return cookie?.split(';')[0];
}

export async function registerCustomer(
  app: INestApplication,
  overrides: Record<string, unknown> = {},
) {
  const payload = registrationPayload(overrides);
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(payload)
    .expect(201);
  return {
    payload,
    accessToken: res.body.data.accessToken as string,
    user: res.body.data.user,
    cookie: refreshCookieFrom(res)!,
  };
}

export async function login(app: INestApplication, email: string, password = TEST_PASSWORD) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    accessToken: res.body.data.accessToken as string,
    cookie: refreshCookieFrom(res)!,
    body: res.body,
  };
}

/** Creates a staff user directly in the database (staff cannot self-register). */
export async function createStaff(app: INestApplication, role: Role, emailPrefix: string) {
  const users = app.get<Model<User>>(getModelToken(User.name));
  const email = `${emailPrefix}.${Date.now()}@vinaybank.test`;
  await users.create({
    role,
    email,
    phone: `90${String(Date.now()).slice(-8)}`,
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    firstName: 'Staff',
    lastName: role,
    employeeId: `EMP${Date.now()}`,
    branchCode: '0001',
  });
  return login(app, email);
}
