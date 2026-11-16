import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CardSwitchModule } from './card-switch.module';

/** Starts the card switch. It has no HTTP server: it speaks ISO 8583 over mutual TLS only. */
async function bootstrap(): Promise<void> {
  // JSON lines in production (like the API's logs, ready for a log pipeline), colours in development
  const app = await NestFactory.createApplicationContext(CardSwitchModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('Vinay Bank card switch started');
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal: the card switch failed to start', error);
  process.exit(1);
});
