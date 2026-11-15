import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ConfiguredIoAdapter } from './common/adapters/configured-io.adapter';
import { API_DEFAULT_VERSION, API_PREFIX } from './common/constants/app.constants';
import { bodyParserErrorMiddleware } from './common/middleware/body-parser-error.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { TypedConfigService } from './config/config.types';
import { mountSoapServices } from './modules/soap/soap.setup';

/**
 * HTTP-level configuration shared by main.ts and the e2e tests, so tests
 * exercise exactly the same middleware stack as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<TypedConfigService>(ConfigService);

  // Behind nginx, trust X-Forwarded-For so rate limiting and audit logs see the real client IP.
  app.set('trust proxy', config.get('trustProxy', { infer: true }));

  // Correlation id first, so every response (even early errors) can be traced in the logs.
  app.use(requestIdMiddleware);

  // Secure HTTP headers: HSTS, X-Content-Type-Options, frame protection, CSP, etc.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(compression());
  app.use(cookieParser());

  // Small body limits reduce the impact of oversized-payload attacks.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '64kb' });
  app.use(bodyParserErrorMiddleware);

  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true, // the refresh-token cookie is sent cross-origin in development
    exposedHeaders: ['X-Request-Id'],
  });

  // Real-time notifications (Socket.IO) share the HTTP server and the CORS allow-list.
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, config.get('corsOrigins', { infer: true })));

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });
  app.enableShutdownHooks();

  // SOAP partner service (node-soap on Express), registered before Nest's not-found handler.
  mountSoapServices(app);
}
