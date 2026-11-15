import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import { connect } from 'node:tls';
import {
  clientTlsOptions,
  describeMessage,
  frame,
  FrameDecoder,
  packWithMac,
  redactedHex,
  text,
  unpack,
  verifyMac,
  type DescribedMessage,
  type IsoMessage,
} from '@app/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AppConfig } from '../../../config/configuration';

export interface WireMessage extends DescribedMessage {
  /** Frame bytes as hex, with cardholder data blanked out */
  hex: string;
  bytes: number;
}

export interface WireExchange {
  request: WireMessage;
  response: WireMessage;
  roundTripMs: number;
  tls: { protocol: string | null; cipher: string; serverCertificate: string };
}

function wire(message: IsoMessage, bytes: number): WireMessage {
  return { ...describeMessage(message), hex: redactedHex(message), bytes };
}

function unavailable(message: string): AppException {
  return new AppException(ErrorCode.SERVICE_UNAVAILABLE, message, HttpStatus.SERVICE_UNAVAILABLE);
}

/**
 * Acquirer side of the card network: connects to the switch over mutual TLS,
 * sends one MAC-signed ISO 8583 message with 2-byte length framing and waits
 * for the response with the same STAN, verifying its MAC.
 */
@Injectable()
export class AcquirerClient {
  private readonly cards: AppConfig['cards'];

  constructor(config: ConfigService<AppConfig, true>) {
    this.cards = config.get('cards', { infer: true });
  }

  exchange(message: IsoMessage): Promise<{ response: IsoMessage; exchange: WireExchange }> {
    const tls = this.cards.tls;
    if (!tls)
      return Promise.reject(
        unavailable('Card network certificates are missing. Run "npm run setup".'),
      );
    const { macKey } = this.cards.keys;
    const packed = packWithMac(message, macKey);
    const sent = unpack(packed);
    const stan = text(sent, 11);

    return new Promise((resolve, reject) => {
      let settled = false;
      const started = performance.now();
      const socket = connect({
        host: this.cards.switchHost,
        port: this.cards.switchPort,
        ...clientTlsOptions(tls.client),
      });
      const decoder = new FrameDecoder();
      const finish = (
        error: Error | null,
        result?: { response: IsoMessage; exchange: WireExchange },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(
        () => finish(unavailable('The card switch did not answer in time')),
        this.cards.timeoutMs,
      );

      socket.once('secureConnect', () => socket.write(frame(packed)));
      socket.on('data', (chunk: Buffer) => {
        try {
          for (const raw of decoder.push(chunk)) {
            const response = unpack(raw);
            if (text(response, 11) !== stan) continue;
            if (!verifyMac(raw, response, macKey)) {
              finish(unavailable('The response failed MAC verification and was discarded'));
              return;
            }
            const cipher = socket.getCipher();
            finish(null, {
              response,
              exchange: {
                request: wire(sent, packed.length),
                response: wire(response, raw.length),
                roundTripMs: Math.round((performance.now() - started) * 10) / 10,
                tls: {
                  protocol: socket.getProtocol(),
                  cipher: cipher.standardName ?? cipher.name,
                  serverCertificate: String(socket.getPeerCertificate().subject?.CN ?? ''),
                },
              },
            });
            return;
          }
        } catch (error) {
          finish(error as Error);
        }
      });
      socket.on('error', (error: NodeJS.ErrnoException) =>
        finish(
          unavailable(
            `The card switch is not reachable (${error.code ?? error.message}). Is it running?`,
          ),
        ),
      );
      socket.on('close', () => finish(unavailable('The card switch closed the connection')));
    });
  }
}
