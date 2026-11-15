import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { serverTlsOptions } from '@app/shared';
import type { TypedConfigService } from './config/config.types';

/**
 * Adds the issuer's RPC listener for the card switch: a NestJS TCP
 * microservice wrapped in mutual TLS, so only components holding a client
 * certificate from our CA can ask for authorizations. Returns false (and the
 * card network stays offline) when the TLS material has not been generated.
 */
export function connectCardNetwork(app: INestApplication): boolean {
  const cards = app.get<TypedConfigService>(ConfigService).get('cards', { infer: true });
  if (!cards.tls) {
    new Logger('CardNetwork').warn(
      'Card network offline: TLS certificates not found (run "npm run setup")',
    );
    return false;
  }
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: cards.coreRpcHost,
      port: cards.coreRpcPort,
      tlsOptions: serverTlsOptions(cards.tls.server),
    },
  });
  new Logger('CardNetwork').log(
    `Issuer RPC listening on ${cards.coreRpcHost}:${cards.coreRpcPort} (mutual TLS)`,
  );
  return true;
}
