import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { connectCardNetwork } from '../../src/card-network.setup';

/**
 * Boots the full application with the same HTTP configuration as main.ts.
 * `cardNetwork: true` also starts the issuer's mutual-TLS RPC listener for the card switch.
 */
export async function createTestApp(
  options: { cardNetwork?: boolean } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  // Set E2E_DEBUG=1 to see server-side errors while debugging a failing test.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: process.env.E2E_DEBUG ? ['error', 'warn'] : false,
  });
  configureApp(app);
  if (options.cardNetwork && connectCardNetwork(app)) await app.startAllMicroservices();
  await app.init();
  return app;
}
