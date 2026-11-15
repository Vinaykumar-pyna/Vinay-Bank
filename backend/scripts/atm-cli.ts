/**
 * ArthaBank ATM terminal (command line): talks ISO 8583 to the card switch
 * directly over mutual TLS, exactly like ATM software would.
 *
 *   npm run atm -- echo
 *   npm run atm -- balance  --demo --pin 4826
 *   npm run atm -- withdraw --demo --pin 4826 --amount 500
 *   npm run atm -- withdraw --pan 6528451012345678 --expiry 11/31 --pin 4826 --amount 500
 *
 * --demo fetches the demo customer's card number from the running API (demo mode only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { connect } from 'node:tls';
import { parseArgs } from 'node:util';
import {
  buildPinBlock,
  clientTlsOptions,
  CURRENCY_INR,
  describeMessage,
  describeResponseCode,
  encryptPinBlock,
  frame,
  FrameDecoder,
  loadCardNetworkConfig,
  MCC_ATM,
  NETWORK_CODES,
  packWithMac,
  PROCESSING_CODES,
  randomDigits,
  redactedHex,
  text,
  unpack,
  verifyMac,
  type IsoMessage,
} from '@app/shared';

const backendDir = resolve(__dirname, '..');
for (const line of readFileSync(resolve(backendDir, '.env'), 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
}
process.chdir(backendDir); // TLS paths in .env are relative to backend/

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    pan: { type: 'string' },
    expiry: { type: 'string' },
    pin: { type: 'string' },
    amount: { type: 'string' },
    demo: { type: 'boolean', default: false },
    api: { type: 'string', default: `http://localhost:${process.env.API_PORT ?? 4000}/api/v1` },
  },
});
const command = positionals[0] ?? 'echo';
const config = loadCardNetworkConfig();
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const pad2 = (n: number) => String(n).padStart(2, '0');

function hexDump(hex: string): string {
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 32) {
    const chunk = hex.slice(i, i + 32);
    const ascii = Buffer.from(chunk, 'hex')
      .toString('latin1')
      .replace(/[^\x20-\x7e]/g, '.');
    lines.push(
      `  ${String(i / 2).padStart(4, '0')}  ${chunk
        .match(/.{1,2}/g)!
        .join(' ')
        .padEnd(47)}  ${ascii}`,
    );
  }
  return lines.join('\n');
}

function show(label: string, message: IsoMessage): void {
  const described = describeMessage(message);
  console.log(
    `\n${bold(label)}  MTI ${described.mti} (${described.mtiName})  bitmap ${described.bitmap}`,
  );
  for (const field of described.fields) {
    console.log(`  ${String(field.field).padStart(3)}  ${field.name.padEnd(38)} ${field.value}`);
  }
  console.log(dim(hexDump(redactedHex(message))));
}

async function demoCard(): Promise<{ pan: string; expiry: string }> {
  const res = await fetch(`${values.api}/simulator/demo-card`);
  if (!res.ok)
    throw new Error(
      `Could not load the demo card from ${values.api} (is the API running in demo mode?)`,
    );
  const body = (await res.json()) as { data: { pan: string; expiry: string } };
  return body.data;
}

async function buildRequest(): Promise<IsoMessage> {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const stan = randomDigits(6);
  const transmission = `${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
  if (command === 'echo') {
    return { mti: '0800', fields: { 7: transmission, 11: stan, 70: NETWORK_CODES.ECHO_TEST } };
  }
  if (command !== 'balance' && command !== 'withdraw')
    throw new Error(`Unknown command "${command}"`);
  const card = values.demo ? await demoCard() : { pan: values.pan, expiry: values.expiry };
  if (!card.pan || !card.expiry || !values.pin)
    throw new Error('Give --pan, --expiry and --pin (or --demo and --pin)');
  const [month, year] = card.expiry.split('/');
  const amount = command === 'withdraw' ? Math.round(Number(values.amount ?? '0') * 100) : 0;
  if (command === 'withdraw' && !(amount > 0))
    throw new Error('Give --amount in rupees, e.g. --amount 500');
  const julian = Math.floor((ist.getTime() - Date.UTC(ist.getUTCFullYear(), 0, 0)) / 86_400_000);
  return {
    mti: '0200',
    fields: {
      2: card.pan,
      3:
        command === 'balance' ? PROCESSING_CODES.BALANCE_INQUIRY : PROCESSING_CODES.CASH_WITHDRAWAL,
      4: String(amount),
      7: transmission,
      11: stan,
      12: `${pad2(ist.getUTCHours())}${pad2(ist.getUTCMinutes())}${pad2(ist.getUTCSeconds())}`,
      13: `${pad2(ist.getUTCMonth() + 1)}${pad2(ist.getUTCDate())}`,
      14: `${year}${month}`,
      18: MCC_ATM,
      22: '051',
      25: '00',
      32: '600001',
      37: `${ist.getUTCFullYear() % 10}${String(julian).padStart(3, '0')}${pad2(ist.getUTCHours())}${stan}`,
      41: 'ATMCLI01',
      42: 'ARTHAATMCLI0001',
      43: `${'ARTHABANK CLI ATM'.padEnd(25)}${'MUMBAI'.padEnd(13)}IN`,
      49: CURRENCY_INR,
      52: encryptPinBlock(buildPinBlock(values.pin, card.pan), config.keys.zpkAcquirer),
    },
  };
}

async function main(): Promise<void> {
  if (!config.tls) throw new Error('TLS certificates not found. Run "npm run setup" first.');
  const request = await buildRequest();
  const packed = packWithMac(request, config.keys.macKey);
  const signed = unpack(packed);
  const started = performance.now();

  const socket = connect({
    host: config.switchHost,
    port: config.switchPort,
    ...clientTlsOptions(config.tls.client),
  });
  socket.once('secureConnect', () => {
    const cipher = socket.getCipher();
    console.log(
      `${bold('Connected')} to ${config.switchHost}:${config.switchPort} with ${socket.getProtocol()} ` +
        `${cipher.standardName ?? cipher.name}; server certificate CN=${String(socket.getPeerCertificate().subject?.CN)}`,
    );
    show('Request', signed);
    socket.write(frame(packed));
  });
  const decoder = new FrameDecoder();
  socket.on('data', (chunk: Buffer) => {
    for (const raw of decoder.push(chunk)) {
      const response = unpack(raw);
      show('Response', response);
      const code = text(response, 39) ?? '??';
      const macOk = verifyMac(raw, response, config.keys.macKey);
      console.log(
        `\n${bold(`Response code ${code}`)}: ${describeResponseCode(code)}  ` +
          `${dim(`(${Math.round(performance.now() - started)} ms, MAC ${macOk ? 'verified' : 'INVALID'})`)}`,
      );
      const balances = text(response, 54);
      if (balances) {
        const available = Number(balances.slice(28, 40)) / 100;
        console.log(
          `Available balance: Rs ${available.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        );
      }
      socket.end();
    }
  });
  socket.on('error', (error: NodeJS.ErrnoException) => {
    console.error(
      `Connection failed: ${error.code ?? error.message}. Is the card switch running ("npm run dev")?`,
    );
    process.exitCode = 1;
  });
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
