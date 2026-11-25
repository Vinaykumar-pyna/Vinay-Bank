import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { APP_NAME, APP_VERSION } from './common/constants/app.constants';

/**
 * OpenAPI documentation, served at /api/docs (UI) and /api/docs-json (spec).
 * The JSON spec can be imported into any OpenAPI-compatible client or tool.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle(`${APP_NAME} Core Banking API`)
    .setDescription(
      [
        'REST API for the Vinay Bank digital banking platform.',
        '',
        'All responses use an envelope: `{ success, data, meta? }` on success and',
        '`{ success: false, statusCode, error: { code, message, details? }, requestId }` on failure.',
        'Amounts are integers in **paise** (1 rupee = 100 paise) to avoid floating-point errors.',
      ].join('\n'),
    )
    .setVersion(APP_VERSION)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth('vb_refresh', { type: 'apiKey', in: 'cookie' }, 'refresh-cookie')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: `${APP_NAME} API docs`,
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });
}
