import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { createServer, type Server, type TLSSocket } from 'node:tls';
import {
  frame,
  FrameDecoder,
  maskPan,
  packWithMac,
  serverTlsOptions,
  text,
  unpack,
  verifyMac,
  type CardNetworkConfig,
  type IsoMessage,
} from '@app/shared';
import { SwitchRouter } from './switch-router.service';
import { CARD_NETWORK_CONFIG } from './tokens';

/** Idle connections are closed after a minute. */
const IDLE_TIMEOUT_MS = 60_000;

/**
 * The switch's network edge: a TLS 1.2+ server that requires client
 * certificates (mutual TLS), reads 2-byte length-framed ISO 8583 messages,
 * checks each MAC and writes back a MAC-signed response.
 */
@Injectable()
export class IsoServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('IsoServer');
  private server?: Server;
  private readonly sockets = new Set<TLSSocket>();

  constructor(
    private readonly router: SwitchRouter,
    @Inject(CARD_NETWORK_CONFIG) private readonly config: CardNetworkConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.tls) {
      throw new Error('Card network TLS certificates not found. Run "npm run setup" first.');
    }
    const server = createServer(serverTlsOptions(this.config.tls.server), (socket) =>
      this.accept(socket),
    );
    server.on('tlsClientError', (error, socket) =>
      this.logger.warn(`Rejected a TLS client from ${socket.remoteAddress}: ${error.message}`),
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.config.switchPort, this.config.switchHost, () => resolve());
    });
    this.server = server;
    this.logger.log(
      `ISO 8583 switch listening on ${this.config.switchHost}:${this.config.switchPort} ` +
        `(mutual TLS; issuer at ${this.config.coreRpcHost}:${this.config.coreRpcPort})`,
    );
  }

  private accept(socket: TLSSocket): void {
    const peer = String(socket.getPeerCertificate().subject?.CN ?? 'unknown');
    this.sockets.add(socket);
    socket.setNoDelay(true);
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.end());
    const decoder = new FrameDecoder();
    socket.on('data', (chunk: Buffer) => {
      let frames: Buffer[];
      try {
        frames = decoder.push(chunk);
      } catch (error) {
        this.logger.warn(`Framing error from ${peer}: ${(error as Error).message}; closing`);
        socket.destroy();
        return;
      }
      for (const raw of frames) void this.process(socket, raw, peer);
    });
    socket.on('error', (error) => this.logger.warn(`Connection error (${peer}): ${error.message}`));
    socket.on('close', () => this.sockets.delete(socket));
  }

  private async process(socket: TLSSocket, raw: Buffer, peer: string): Promise<void> {
    const started = performance.now();
    let request: IsoMessage;
    try {
      request = unpack(raw);
    } catch (error) {
      this.logger.warn(`Unreadable message from ${peer} dropped: ${(error as Error).message}`);
      return;
    }
    const response = verifyMac(raw, request, this.config.keys.macKey)
      ? await this.router.handle(request)
      : this.router.securityViolation(request);
    if (socket.writable) socket.write(frame(packWithMac(response, this.config.keys.macKey)));

    const pan = text(request, 2);
    this.logger.log(
      `${request.mti} -> ${response.mti} stan=${text(request, 11) ?? '-'} ` +
        `pan=${pan ? maskPan(pan) : '-'} rc=${text(response, 39)} ` +
        `${Math.round(performance.now() - started)}ms peer=${peer}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }
}
