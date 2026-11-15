import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { clientTlsOptions, loadCardNetworkConfig } from '@app/shared';
import { IsoServer } from './iso-server.service';
import { SwitchRouter } from './switch-router.service';
import { CARD_NETWORK_CONFIG, ISSUER_CLIENT } from './tokens';

/**
 * Card switch: a separate NestJS application (its own process) between card
 * acceptors (ATMs, shop terminals) and the issuer (the core banking API).
 */
@Module({
  imports: [
    // Reads backend/.env; tests set the environment explicitly instead.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    ClientsModule.registerAsync([
      {
        name: ISSUER_CLIENT,
        useFactory: () => {
          const config = loadCardNetworkConfig();
          if (!config.tls) {
            throw new Error('Card network TLS certificates not found. Run "npm run setup" first.');
          }
          return {
            transport: Transport.TCP,
            options: {
              host: config.coreRpcHost,
              port: config.coreRpcPort,
              tlsOptions: clientTlsOptions(config.tls.client),
            },
          };
        },
      },
    ]),
  ],
  providers: [
    { provide: CARD_NETWORK_CONFIG, useFactory: () => loadCardNetworkConfig() },
    SwitchRouter,
    IsoServer,
  ],
})
export class CardSwitchModule {}
