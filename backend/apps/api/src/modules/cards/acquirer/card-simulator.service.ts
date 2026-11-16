import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildPinBlock,
  CURRENCY_INR,
  describeResponseCode,
  encryptPinBlock,
  MCC_ATM,
  NETWORK_CODES,
  PROCESSING_CODES,
  randomDigits,
  text,
  type IsoMessage,
} from '@app/shared';
import type { AppConfig } from '../../../config/configuration';
import { AcquirerClient, type WireExchange } from './acquirer-client.service';
import type { SimulatorRequestDto } from './simulator.dto';

/** Acquiring institution ID (field 32) of the simulated ATM and POS network. */
const ACQUIRER_ID = '600001';

export interface TerminalProfile {
  type: 'ATM' | 'POS';
  terminalId: string;
  merchantId: string;
  label: string;
  /** Field 43: name (25) + city (13) + country (2) */
  nameLocation: string;
  mcc: string;
  entryMode: string;
}

const location = (name: string, city: string) =>
  `${name.padEnd(25).slice(0, 25)}${city.padEnd(13).slice(0, 13)}IN`;

export const TERMINALS: Record<'ATM' | 'POS', TerminalProfile> = {
  ATM: {
    type: 'ATM',
    terminalId: 'ATMMUM01',
    merchantId: 'VINAYATM0000001',
    label: 'Vinay Bank ATM, Fort, Mumbai',
    nameLocation: location('VINAY BANK ATM FORT', 'MUMBAI'),
    mcc: MCC_ATM,
    entryMode: '051', // chip read, PIN entered
  },
  POS: {
    type: 'POS',
    terminalId: 'POSPUN07',
    merchantId: 'BLUETOKAI000452',
    label: 'Blue Tokai Coffee, Koregaon Park, Pune',
    nameLocation: location('BLUE TOKAI COFFEE', 'PUNE'),
    mcc: '5814',
    entryMode: '051',
  },
};

export interface SimulatorOutcome {
  operation: SimulatorRequestDto['operation'];
  terminal: string;
  approved: boolean;
  responseCode: string;
  message: string;
  authCode?: string;
  amount?: number;
  availableBalance?: number;
  ledgerBalance?: number;
  stan: string;
  rrn?: string;
  transmittedAt: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Field 7 (UTC, MMDDhhmmss) plus fields 12/13 (local time in India). */
function timestamps(at = new Date()) {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return {
    transmission: `${pad2(at.getUTCMonth() + 1)}${pad2(at.getUTCDate())}${pad2(at.getUTCHours())}${pad2(at.getUTCMinutes())}${pad2(at.getUTCSeconds())}`,
    localTime: `${pad2(ist.getUTCHours())}${pad2(ist.getUTCMinutes())}${pad2(ist.getUTCSeconds())}`,
    localDate: `${pad2(ist.getUTCMonth() + 1)}${pad2(ist.getUTCDate())}`,
    julian: `${ist.getUTCFullYear() % 10}${String(Math.floor((ist.getTime() - Date.UTC(ist.getUTCFullYear(), 0, 0)) / 86_400_000)).padStart(3, '0')}${pad2(ist.getUTCHours())}`,
  };
}

/** Field 54: 20-character sets of account type, amount type, currency, sign and amount. */
export function parseAdditionalAmounts(value: string | undefined): {
  ledger?: number;
  available?: number;
} {
  const result: { ledger?: number; available?: number } = {};
  for (let i = 0; value && i + 20 <= value.length; i += 20) {
    const set = value.slice(i, i + 20);
    const amount = Number(set.slice(8)) * (set[7] === 'D' ? -1 : 1);
    if (set.slice(2, 4) === '01') result.ledger = amount;
    if (set.slice(2, 4) === '02') result.available = amount;
  }
  return result;
}

/**
 * The simulated ATM and shop terminal behind the "Card network simulator" page.
 * It does what real terminal software does: builds the ISO 8583 message,
 * encrypts the PIN under the acquirer zone PIN key and sends it to the switch.
 */
@Injectable()
export class CardSimulatorService {
  private readonly zpk: Buffer;

  constructor(
    private readonly client: AcquirerClient,
    config: ConfigService<AppConfig, true>,
  ) {
    this.zpk = config.get('cards', { infer: true }).keys.zpkAcquirer;
  }

  terminals(): TerminalProfile[] {
    return Object.values(TERMINALS);
  }

  async run(
    dto: SimulatorRequestDto,
  ): Promise<{ outcome: SimulatorOutcome; exchange: WireExchange }> {
    const terminal = TERMINALS[dto.terminal];
    const time = timestamps();
    const stan = randomDigits(6);
    const message = this.build(dto, terminal, time, stan);
    const { response, exchange } = await this.client.exchange(message);
    const code = text(response, 39) ?? '96';
    const amounts = parseAdditionalAmounts(text(response, 54));
    return {
      exchange,
      outcome: {
        operation: dto.operation,
        terminal: terminal.label,
        approved: code === '00',
        responseCode: code,
        message: describeResponseCode(code),
        authCode: text(response, 38) || undefined,
        amount: dto.operation === 'REVERSAL' ? dto.original?.amount : dto.amount,
        availableBalance: amounts.available,
        ledgerBalance: amounts.ledger,
        stan,
        rrn: text(message, 37),
        transmittedAt: time.transmission,
      },
    };
  }

  private build(
    dto: SimulatorRequestDto,
    terminal: TerminalProfile,
    time: ReturnType<typeof timestamps>,
    stan: string,
  ): IsoMessage {
    if (dto.operation === 'ECHO') {
      return {
        mti: '0800',
        fields: { 7: time.transmission, 11: stan, 70: NETWORK_CODES.ECHO_TEST },
      };
    }
    const common: IsoMessage['fields'] = {
      2: dto.pan,
      7: time.transmission,
      11: stan,
      12: time.localTime,
      13: time.localDate,
      32: ACQUIRER_ID,
      41: terminal.terminalId,
      42: terminal.merchantId,
      49: CURRENCY_INR,
    };
    if (dto.operation === 'REVERSAL') {
      const original = dto.original!;
      return {
        mti: '0420',
        fields: {
          ...common,
          3:
            original.operation === 'WITHDRAWAL'
              ? PROCESSING_CODES.CASH_WITHDRAWAL
              : PROCESSING_CODES.PURCHASE,
          4: String(original.amount),
          37: original.rrn,
          // Original data elements: MTI, STAN, transmission time, acquirer and forwarding institution IDs
          90: `0200${original.stan}${original.transmittedAt}${ACQUIRER_ID.padStart(11, '0')}${'0'.repeat(11)}`,
        },
      };
    }
    const processingCode =
      dto.operation === 'BALANCE'
        ? PROCESSING_CODES.BALANCE_INQUIRY
        : dto.operation === 'WITHDRAWAL'
          ? PROCESSING_CODES.CASH_WITHDRAWAL
          : PROCESSING_CODES.PURCHASE;
    const [month, year] = dto.expiry!.split('/');
    return {
      mti: '0200',
      fields: {
        ...common,
        3: processingCode,
        4: String(dto.operation === 'BALANCE' ? 0 : dto.amount),
        14: `${year}${month}`,
        18: terminal.mcc,
        22: terminal.entryMode,
        25: '00',
        37: `${time.julian}${stan}`,
        43: terminal.nameLocation,
        ...(dto.pin ? { 52: encryptPinBlock(buildPinBlock(dto.pin, dto.pan!), this.zpk) } : {}),
      },
    };
  }
}
