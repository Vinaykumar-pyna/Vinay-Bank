import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  CARD_RPC,
  CURRENCY_INR,
  describeResponseCode,
  NETWORK_CODES,
  responseMti,
  text,
  translatePinBlock,
  type CardAuthorizeRequest,
  type CardAuthorizeResponse,
  type CardNetworkConfig,
  type CardOperation,
  type CardReverseRequest,
  type CardReverseResponse,
  type IsoMessage,
} from '@app/shared';
import { CARD_NETWORK_CONFIG, ISSUER_CLIENT } from './tokens';

const OPERATIONS: Record<string, CardOperation> = {
  '00': 'PURCHASE',
  '01': 'CASH_WITHDRAWAL',
  '31': 'BALANCE_INQUIRY',
};

/** Fields copied from a request into its response, per message class. */
const ECHOED: Record<string, number[]> = {
  '0200': [2, 3, 4, 7, 11, 12, 13, 32, 37, 41, 42, 49],
  '0420': [2, 3, 4, 7, 11, 32, 37, 41, 42, 49],
  '0800': [7, 11, 70],
};

const REQUIRED_0200 = [2, 3, 4, 7, 11, 14, 18, 22, 37, 41, 42, 49];

/** Field 54 set: account type 00, amount type (01 ledger, 02 available), INR, sign, 12-digit amount. */
function additionalAmount(type: '01' | '02', paise: number): string {
  return `00${type}${CURRENCY_INR}${paise < 0 ? 'D' : 'C'}${String(Math.abs(paise)).padStart(12, '0')}`;
}

/**
 * Routing and translation inside the switch: ISO 8583 from acquirers in,
 * issuer RPC calls out, and an ISO 8583 response for every request (a switch
 * must always answer, with a decline code if the issuer cannot be reached).
 */
@Injectable()
export class SwitchRouter {
  private readonly logger = new Logger('SwitchRouter');

  constructor(
    @Inject(ISSUER_CLIENT) private readonly issuer: ClientProxy,
    @Inject(CARD_NETWORK_CONFIG) private readonly config: CardNetworkConfig,
  ) {}

  async handle(request: IsoMessage): Promise<IsoMessage> {
    switch (request.mti) {
      case '0800':
        return this.networkManagement(request);
      case '0200':
        return this.financial(request);
      case '0420':
        return this.reversal(request);
      default:
        return this.reply(request, '12');
    }
  }

  /** The request's MAC did not verify: answer without involving the issuer. */
  securityViolation(request: IsoMessage): IsoMessage {
    return this.reply(request, '63');
  }

  private reply(request: IsoMessage, code: string, extra: IsoMessage['fields'] = {}): IsoMessage {
    const fields: IsoMessage['fields'] = {};
    for (const field of ECHOED[request.mti] ?? [7, 11]) {
      if (request.fields[field] !== undefined) fields[field] = request.fields[field];
    }
    let mti = '0810';
    try {
      mti = responseMti(request.mti);
    } catch {
      // Not a request MTI: answer as network management.
    }
    return { mti, fields: { ...fields, ...extra, 39: code } };
  }

  private networkManagement(request: IsoMessage): IsoMessage {
    const code = text(request, 70);
    const known: string[] = Object.values(NETWORK_CODES);
    return this.reply(request, code && known.includes(code) ? '00' : '12');
  }

  private async financial(request: IsoMessage): Promise<IsoMessage> {
    if (REQUIRED_0200.some((field) => request.fields[field] === undefined)) {
      return this.reply(request, '30');
    }
    const operation = OPERATIONS[(text(request, 3) ?? '').slice(0, 2)];
    if (!operation || text(request, 49) !== CURRENCY_INR) return this.reply(request, '12');

    let pinBlock: string | undefined;
    const encrypted = request.fields[52];
    if (Buffer.isBuffer(encrypted)) {
      // PIN translation from the acquirer zone key to the issuer zone key, as an HSM would do it.
      pinBlock = translatePinBlock(
        encrypted,
        this.config.keys.zpkAcquirer,
        this.config.keys.zpkIssuer,
      )
        .toString('hex')
        .toUpperCase();
    }
    const nameLocation = typeof request.fields[43] === 'string' ? request.fields[43] : '';
    const payload: CardAuthorizeRequest = {
      operation,
      pan: text(request, 2) ?? '',
      expiry: text(request, 14) ?? '',
      amount: Number(text(request, 4)),
      currency: CURRENCY_INR,
      pinBlock,
      stan: text(request, 11) ?? '',
      rrn: text(request, 37) ?? '',
      terminalId: text(request, 41) ?? '',
      merchantId: text(request, 42) ?? '',
      merchantName: nameLocation.slice(0, 25).trim() || (text(request, 42) ?? 'Merchant'),
      mcc: text(request, 18) ?? '',
      entryMode: text(request, 22) ?? '',
    };
    const result = await this.call<CardAuthorizeResponse>(CARD_RPC.AUTHORIZE, payload);
    if (!result) return this.reply(request, '91');

    const extra: IsoMessage['fields'] = {};
    if (result.responseCode === '00' && result.authCode) extra[38] = result.authCode;
    if (result.ledgerBalance !== undefined && result.availableBalance !== undefined) {
      extra[54] =
        additionalAmount('01', result.ledgerBalance) +
        additionalAmount('02', result.availableBalance);
    }
    return this.reply(request, result.responseCode, extra);
  }

  private async reversal(request: IsoMessage): Promise<IsoMessage> {
    if ([4, 11, 37, 41].some((field) => request.fields[field] === undefined)) {
      return this.reply(request, '30');
    }
    const cash = (text(request, 3) ?? '').startsWith('01');
    const payload: CardReverseRequest = {
      rrn: text(request, 37) ?? '',
      terminalId: text(request, 41) ?? '',
      stan: text(request, 11) ?? '',
      amount: Number(text(request, 4)),
      reason: cash ? 'Cash not dispensed' : 'Cancelled at the terminal',
    };
    const result = await this.call<CardReverseResponse>(CARD_RPC.REVERSE, payload);
    return this.reply(request, result?.responseCode ?? '91');
  }

  /** Issuer call with a timeout. An unreachable or slow issuer gives undefined (code 91). */
  private async call<T>(pattern: string, payload: object): Promise<T | undefined> {
    try {
      return await firstValueFrom(
        this.issuer.send<T>(pattern, payload).pipe(timeout(this.config.timeoutMs)),
      );
    } catch (error) {
      this.logger.error(
        `Issuer call ${pattern} failed: ${(error as Error).message} (${describeResponseCode('91')})`,
      );
      return undefined;
    }
  }
}
