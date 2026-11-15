import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { connectCardNetwork } from './card-network.setup';
import type { TypedConfigService } from './config/config.types';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  configureApp(app);
  setupSwagger(app);

  const config = app.get<TypedConfigService>(ConfigService);
  const port = config.get('port', { infer: true });
  // Hybrid application: HTTP for browsers, plus a mutual-TLS microservice listener for the card switch.
  if (connectCardNetwork(app)) await app.startAllMicroservices();
  await app.listen(port);

  logger.log(`ArthaBank API ready at http://localhost:${port}/api/v1`, 'Bootstrap');
  logger.log(`API docs at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal: the API failed to start', error);
  process.exit(1);
});
