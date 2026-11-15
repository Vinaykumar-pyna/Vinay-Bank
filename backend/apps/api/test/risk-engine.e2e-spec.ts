import type { NestExpressApplication } from '@nestjs/platform-express';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { RiskService } from '../src/modules/risk/risk.service';
import type { RiskContext } from '../src/modules/risk/risk.types';
import { createStaff } from './utils/auth-helpers';
import { auth } from './utils/banking-helpers';
import { createTestApp } from './utils/create-test-app';

const PORT = 18085 + Number(process.env.JEST_WORKER_ID ?? 1);
const API_KEY = 'e2e-risk-engine-key';
process.env.RISK_ENGINE_ENABLED = 'true';
process.env.RISK_ENGINE_URL = `http://127.0.0.1:${PORT}`;
process.env.RISK_ENGINE_API_KEY = API_KEY;
process.env.RISK_ENGINE_TIMEOUT_MS = '300';
process.env.RISK_ENGINE_FAILURE_THRESHOLD = '2';
process.env.RISK_ENGINE_COOLDOWN_MS = '400';

const CONTEXT: RiskContext = {
  amount: 1_23_456_00,
  rail: 'NEFT',
  channel: 'NET_BANKING',
  ownAccountTransfer: false,
  beneficiaryAgeHours: 3,
  transfersLastHour: 0,
  amountLast24h: 0,
  dailyLimit: 10_00_000_00,
  averageDebit90d: 1_00_000_00,
  hourOfDayIst: 11,
  accountAgeDays: 400,
  kycVerified: true,
};

/** Stand-in for the Spring Boot service, with the same API (a contract test of the client side). */
class FakeRiskEngine {
  server?: Server;
  calls: { apiKey?: string; body: unknown }[] = [];
  malformed = false;

  start(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res) => {
      if (req.url === '/actuator/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"UP"}');
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        this.calls.push({
          apiKey: req.headers['x-api-key'] as string | undefined,
          body: JSON.parse(body || '{}'),
        });
        if (req.headers['x-api-key'] !== API_KEY) {
          res.writeHead(401).end();
          return;
        }
        const payload = this.malformed
          ? { unexpected: true }
          : {
              score: 45,
              level: 'MEDIUM',
              decision: 'STEP_UP',
              reasons: ['Large amount (Rs 1 lakh or more)', 'Payee was added in the last 24 hours'],
              hits: [],
              source: 'JAVA_ENGINE',
              engineVersion: 'java-rules-1.0',
            };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
      });
    });
    return new Promise((resolve) => this.server!.listen(PORT, '127.0.0.1', resolve));
  }

  stop(): Promise<void> {
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}

describe('Java risk engine client: circuit breaker and fallback (e2e)', () => {
  let app: NestExpressApplication;
  let risk: RiskService;
  const engine = new FakeRiskEngine();

  beforeAll(async () => {
    await engine.start();
    app = await createTestApp();
    risk = app.get(RiskService);
  });

  afterAll(async () => {
    await engine.stop();
    await app.close();
  });

  it('scores with the Java engine when it is up, sending the shared API key', async () => {
    const result = await risk.assess(CONTEXT);
    expect(result).toMatchObject({
      source: 'JAVA_ENGINE',
      score: 45,
      decision: 'STEP_UP',
      engineVersion: 'java-rules-1.0',
    });
    expect(engine.calls.at(-1)).toMatchObject({
      apiKey: API_KEY,
      body: { amount: CONTEXT.amount, rail: 'NEFT' },
    });
  });

  it('shows the engine as up on the staff overview', async () => {
    const manager = await createStaff(app, Role.MANAGER, 'risk.manager');
    const res = await request(app.getHttpServer())
      .get('/api/v1/staff/overview')
      .set(auth(manager.accessToken))
      .expect(200);
    expect(res.body.data.riskEngine).toMatchObject({ health: 'UP', state: 'CLOSED' });
  });

  it('falls back to local rules with the same verdict, opens the circuit, then recovers', async () => {
    await engine.stop();
    const fallback = await risk.assess(CONTEXT);
    // Same rules, same answer: only the source differs.
    expect(fallback).toMatchObject({ source: 'LOCAL_RULES', score: 45, decision: 'STEP_UP' });
    await risk.assess(CONTEXT);
    expect(risk.engineStatus().circuit.state).toBe('OPEN');

    const started = Date.now();
    await risk.assess(CONTEXT); // fails fast: no connection attempt while open
    expect(Date.now() - started).toBeLessThan(100);

    await engine.start();
    await new Promise((resolve) => setTimeout(resolve, 450)); // cooldown
    const recovered = await risk.assess(CONTEXT);
    expect(recovered.source).toBe('JAVA_ENGINE');
    expect(risk.engineStatus().circuit.state).toBe('CLOSED');
  });

  it('treats a malformed answer as a failure and falls back', async () => {
    engine.malformed = true;
    const result = await risk.assess(CONTEXT);
    engine.malformed = false;
    expect(result.source).toBe('LOCAL_RULES');
    expect(risk.engineStatus().circuit.lastError).toMatch(/Malformed/);
  });
});
