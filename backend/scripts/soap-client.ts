/**
 * ArthaBank SOAP partner client: downloads the WSDL, lets node-soap build a
 * client from it and calls the service with a WS-Security UsernameToken
 * (PasswordDigest with nonce and timestamp), the way a partner's ERP system
 * would.
 *
 *   npm run soap -- balance
 *   npm run soap -- statement --count 5
 *   npm run soap -- ifsc --code SBIN0000001
 *   npm run soap -- security     (a replayed request and a wrong password are refused)
 *
 * --account defaults to the demo partner customer's savings account.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createClientAsync, WSSecurity, type Client } from 'soap';

const backendDir = resolve(__dirname, '..');
for (const line of readFileSync(resolve(backendDir, '.env'), 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: 'string', default: '000210000014' },
    count: { type: 'string', default: '5' },
    code: { type: 'string', default: 'SBIN0000001' },
    url: {
      type: 'string',
      default: `http://localhost:${process.env.API_PORT ?? 4000}/soap/banking`,
    },
  },
});
const command = positionals[0] ?? 'balance';
const SOAP_ACTION = 'urn:arthabank:soap:banking:1#';

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const ok = (s: string) => console.log(`\x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => console.log(`\x1b[31m✗\x1b[0m ${s}`);

/** node-soap returns [result, rawResponse, soapHeader, rawRequest] from each *Async method. */
type Operation = (args: Record<string, unknown>) => Promise<[Record<string, unknown>]>;

async function partnerClient(password = process.env.SOAP_PASSWORD ?? ''): Promise<Client> {
  const client = await createClientAsync(`${values.url}?wsdl`);
  client.setSecurity(
    new WSSecurity(process.env.SOAP_USERNAME ?? 'erp-partner', password, {
      passwordType: 'PasswordDigest',
      hasNonce: true,
      hasTimeStamp: true,
      mustUnderstand: true,
    }),
  );
  return client;
}

function call(client: Client, operation: string, args: Record<string, unknown>) {
  const method = (client as unknown as Record<string, Operation>)[`${operation}Async`];
  return method.call(client, args).then(([result]) => result);
}

/** The faultstring of a SOAP fault, from node-soap's error or from raw XML. */
function faultOf(error: unknown): string {
  const body = (error as { root?: { Envelope?: { Body?: { Fault?: { faultstring?: unknown } } } } })
    .root?.Envelope?.Body;
  const text = body?.Fault?.faultstring;
  if (typeof text === 'string') return text;
  return error instanceof Error ? error.message : String(error);
}

const rupees = (value: unknown) =>
  `Rs ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
/** xsd:dateTime values arrive as Date objects (node-soap applies the XSD types). */
const date = (value: unknown, withTime = false) =>
  value instanceof Date
    ? value.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : String(value);

async function balance(): Promise<void> {
  const result = await call(await partnerClient(), 'GetAccountBalance', {
    AccountNumber: values.account,
  });
  console.log(bold(`Account ${String(result.AccountNumber)}`), dim(`${String(result.AccountType)}, ${String(result.Status)}`));
  console.log(`  Ledger balance     ${rupees(result.LedgerBalance)}`);
  console.log(`  Available balance  ${rupees(result.AvailableBalance)}`);
  console.log(dim(`  as of ${date(result.AsOf, true)}`));
}

async function statement(): Promise<void> {
  const result = await call(await partnerClient(), 'GetMiniStatement', {
    AccountNumber: values.account,
    Count: Number(values.count),
  });
  const entries = ([] as Record<string, unknown>[]).concat(
    (result.Entry as Record<string, unknown>[] | Record<string, unknown> | undefined) ?? [],
  );
  console.log(bold(`Last ${entries.length} entries, account ${String(result.AccountNumber)}`));
  for (const entry of entries) {
    const sign = entry.Direction === 'CREDIT' ? '+' : '-';
    console.log(
      `  ${date(entry.Date)}  ${`${sign}${rupees(entry.Amount)}`.padStart(16)}  ${String(entry.Narration).slice(0, 44)}`,
    );
  }
}

async function ifsc(): Promise<void> {
  const result = await call(await partnerClient(), 'ValidateIfsc', { Ifsc: values.code });
  const valid = result.Valid === true || result.Valid === 'true';
  (valid ? ok : bad)(
    `${String(result.Ifsc)}: ${valid ? `${String(result.Bank)}, ${String(result.Branch)}` : 'not a valid IFSC'} ${dim(`(source ${String(result.Source)})`)}`,
  );
}

/** Shows the WS-Security checks from the outside, with real protocol messages. */
async function security(): Promise<void> {
  const client = await partnerClient();
  await call(client, 'GetAccountBalance', { AccountNumber: values.account });
  ok('Signed request accepted (PasswordDigest, fresh nonce and timestamp)');

  // An attacker who captured that request sends it again, byte for byte.
  const replay = await fetch(values.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${SOAP_ACTION}GetAccountBalance"`,
    },
    body: client.lastRequest,
  });
  const replayBody = await replay.text();
  // SOAP 1.1 faults carry <faultstring>; node-soap's authentication fault uses <Text>
  const reason = /<(?:\w+:)?(?:faultstring|Text)>([^<]*)</.exec(replayBody)?.[1] ?? '';
  if (replay.status >= 400 && /<(?:\w+:)?Fault>/.test(replayBody))
    ok(`Replayed request refused: HTTP ${replay.status}, "${reason}"`);
  else bad(`Replayed request was ACCEPTED (HTTP ${replay.status})`);

  try {
    await call(await partnerClient('not-the-partner-password'), 'GetAccountBalance', {
      AccountNumber: values.account,
    });
    bad('Wrong password was ACCEPTED');
  } catch (error) {
    ok(`Wrong password refused: "${faultOf(error)}"`);
  }

  try {
    await call(client, 'GetAccountBalance', { AccountNumber: '999999999999' });
    bad("Another customer's account was returned");
  } catch (error) {
    ok(`Account outside the partner's customer refused: "${faultOf(error)}"`);
  }
  console.log(dim('Failed attempts are in the audit log as SOAP_AUTH_FAILED.'));
}

const commands: Record<string, () => Promise<void>> = { balance, statement, ifsc, security };

async function main(): Promise<void> {
  const run = commands[command];
  if (!run) throw new Error(`Unknown command "${command}" (use ${Object.keys(commands).join(', ')})`);
  if (!process.env.SOAP_PASSWORD) throw new Error('SOAP_PASSWORD is not set in backend/.env');
  console.log(dim(`WSDL ${values.url}?wsdl`));
  await run();
}

main().catch((error: unknown) => {
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  console.error(
    cause === 'ECONNREFUSED'
      ? `Cannot reach ${values.url} (is the API running? npm run dev)`
      : `SOAP call failed: ${faultOf(error)}`,
  );
  process.exitCode = 1;
});
