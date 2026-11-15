import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('Platform basics (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the success envelope and a request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('echoes a caller-supplied X-Request-Id for end-to-end tracing', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-12345678')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });

  it('GET /api/v1/health/ready reports MongoDB as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info.mongodb.status).toBe('up');
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 404,
      error: { code: 'NOT_FOUND' },
      path: '/api/v1/does-not-exist',
    });
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it('rejects malformed JSON with MALFORMED_REQUEST and still returns a request id', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(400);
    expect(res.body.error.code).toBe('MALFORMED_REQUEST');
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it('sets secure HTTP headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS with credentials for the configured web origin only', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
