import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { TypedConfigService } from './config.types';

/**
 * Structured JSON logging with pino.
 *  - Every request gets a correlation id (X-Request-Id), echoed back to the client
 *    and attached to all log lines, so one request can be traced end to end.
 *  - Credentials and secrets are redacted before anything is written.
 *  - Human-friendly pretty output in development, JSON lines in production.
 */
export function buildLoggerConfig(config: TypedConfigService): Params {
  const env = config.get('env', { infer: true });
  const level = config.get('logLevel', { infer: true });
  // Pretty printing runs in a worker thread; only use it for interactive development.
  const usePretty = env === 'development';

  return {
    // Express 5 / path-to-regexp v8 syntax for "every route" (avoids the legacy `*` warning).
    forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
    pinoHttp: {
      level,
      // requestIdMiddleware (app.setup.ts) already assigned req.id; reuse it.
      genReqId: (req: IncomingMessage) => req.id ?? randomUUID(),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.newPassword',
          '*.currentPassword',
          '*.otp',
          '*.pin',
          '*.pan',
          '*.cardNumber',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url?.includes('/health') ?? false,
      },
      transport: !usePretty
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
              messageFormat: '{if context}[{context}] {end}{msg}',
            },
          },
    },
  };
}
