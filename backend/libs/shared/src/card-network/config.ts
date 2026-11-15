import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface TlsMaterial {
  ca: string;
  cert: string;
  key: string;
}

/**
 * Settings shared by the card switch, the issuer and the acquirer simulator.
 * In production each party would hold only its own keys, inside an HSM; in
 * this project one environment file holds all of them for convenience.
 */
export interface CardNetworkConfig {
  /** Bank identification number: the first six digits of every ArthaBank card */
  bin: string;
  switchHost: string;
  switchPort: number;
  coreRpcHost: string;
  coreRpcPort: number;
  timeoutMs: number;
  keys: {
    /** Zone PIN key shared by ATMs/POS (acquirer side) and the switch */
    zpkAcquirer: Buffer;
    /** Zone PIN key shared by the switch and the issuer */
    zpkIssuer: Buffer;
    /** MAC key shared by acquirers and the switch */
    macKey: Buffer;
    /** PIN verification key (issuer only) */
    pvk: Buffer;
    /** Card verification key for CVV derivation (issuer only) */
    cvk: Buffer;
  };
  /** Mutual TLS: `server` for listeners (switch, issuer RPC), `client` for callers. */
  tls: { server: TlsMaterial; client: TlsMaterial } | null;
}

function hexKey(name: string, value: string | undefined): Buffer {
  if (!value || !/^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{48}$/.test(value)) {
    throw new Error(`${name} must be a 16 or 24 byte triple DES key in hex (run "npm run setup")`);
  }
  return Buffer.from(value, 'hex');
}

function base64Key(name: string, value: string | undefined): Buffer {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.length < 32) throw new Error(`${name} must be at least 32 random bytes, base64 encoded`);
  return key;
}

function readTls(env: NodeJS.ProcessEnv): CardNetworkConfig['tls'] {
  const paths = {
    ca: env.TLS_CA_PATH,
    serverCert: env.TLS_SERVER_CERT_PATH,
    serverKey: env.TLS_SERVER_KEY_PATH,
    clientCert: env.TLS_CLIENT_CERT_PATH,
    clientKey: env.TLS_CLIENT_KEY_PATH,
  };
  const files = Object.values(paths);
  if (files.some((path) => !path || !existsSync(resolve(process.cwd(), path)))) return null;
  const read = (path: string | undefined) => readFileSync(resolve(process.cwd(), path!), 'utf8');
  const ca = read(paths.ca);
  return {
    server: { ca, cert: read(paths.serverCert), key: read(paths.serverKey) },
    client: { ca, cert: read(paths.clientCert), key: read(paths.clientKey) },
  };
}

export function loadCardNetworkConfig(env: NodeJS.ProcessEnv = process.env): CardNetworkConfig {
  const bin = env.CARD_BIN ?? '652845';
  if (!/^\d{6}$/.test(bin)) throw new Error('CARD_BIN must be 6 digits');
  return {
    bin,
    switchHost: env.CARD_SWITCH_HOST ?? '127.0.0.1',
    switchPort: Number(env.CARD_SWITCH_PORT ?? 5800),
    coreRpcHost: env.CORE_RPC_HOST ?? '127.0.0.1',
    coreRpcPort: Number(env.CORE_RPC_PORT ?? 4001),
    timeoutMs: Number(env.CARD_NETWORK_TIMEOUT_MS ?? 8000),
    keys: {
      zpkAcquirer: hexKey('CARD_ZPK_ACQUIRER', env.CARD_ZPK_ACQUIRER),
      zpkIssuer: hexKey('CARD_ZPK_ISSUER', env.CARD_ZPK_ISSUER),
      macKey: base64Key('CARD_MAC_KEY', env.CARD_MAC_KEY),
      pvk: base64Key('CARD_PVK', env.CARD_PVK),
      cvk: base64Key('CARD_CVK', env.CARD_CVK),
    },
    tls: readTls(env),
  };
}

/** TLS 1.2+ listener that only accepts clients with a certificate from our CA (mutual TLS). */
export function serverTlsOptions(tls: TlsMaterial) {
  return {
    ca: tls.ca,
    cert: tls.cert,
    key: tls.key,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2' as const,
  };
}

/** TLS client that presents its certificate and trusts only our CA. */
export function clientTlsOptions(tls: TlsMaterial) {
  return {
    ca: tls.ca,
    cert: tls.cert,
    key: tls.key,
    servername: 'localhost',
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2' as const,
  };
}
