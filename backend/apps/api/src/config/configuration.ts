import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadCardNetworkConfig,
  toEncryptionKey,
  type CardNetworkConfig,
  type EncryptionKey,
} from '@app/shared';

/**
 * Typed application configuration.
 *
 * Environment variables are validated first (see env.validation.ts) and then
 * mapped into this nested, strongly typed object. Services read it through
 * `ConfigService<AppConfig, true>` so a typo in a key is a compile error.
 */
export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  env: NodeEnv;
  isProduction: boolean;
  port: number;
  logLevel: string;
  corsOrigins: string[];
  trustProxy: number;
  demoMode: boolean;
  seedDemoData: boolean;
  mongo: {
    uri: string;
  };
  throttle: {
    ttlMs: number;
    limit: number;
  };
  auth: {
    jwtPrivateKeyPem: string;
    jwtPublicKeyPem: string;
    issuer: string;
    audience: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    bcryptRounds: number;
    maxLoginAttempts: number;
    lockoutMinutes: number;
    cookieSecure: boolean;
  };
  security: {
    /** Current key first; older keys are kept only to decrypt existing data. */
    dataKeys: EncryptionKey[];
    blindIndexKey: Buffer;
    /** HMAC key for signed tokens such as transfer quotes and OTP hashes. */
    appHmacKey: Buffer;
  };
  banking: {
    /** Hours after adding a beneficiary during which transfers are capped. */
    beneficiaryCoolingHours: number;
    /** Customer transfers at or above this amount (paise) need a checker's approval. */
    highValueThresholdPaise: number;
    /** Simulated delay before a NEFT batch settles. */
    neftSettlementSeconds: number;
    schedulersEnabled: boolean;
  };
  integrations: {
    ifscApiUrl: string;
    forexApiUrl: string;
    httpTimeoutMs: number;
  };
  /** Card issuing, the ISO 8583 switch connection and its keys */
  cards: CardNetworkConfig;
  /** Java (Spring Boot) fraud risk engine, called through a circuit breaker */
  riskEngine: {
    enabled: boolean;
    url: string;
    apiKey: string;
    timeoutMs: number;
    failureThreshold: number;
    cooldownMs: number;
  };
  /** General ledger database: SQLite via sql.js locally, Oracle in production */
  ledger: {
    type: 'sqljs' | 'oracle';
    /** SQLite file; empty means in-memory (tests) */
    sqlitePath: string;
    oracle: { connectString: string; username: string; password: string };
  };
  /** SOAP partner service: WS-Security credentials bound to one customer's accounts */
  soap: {
    username: string;
    password: string;
    customerEmail: string;
    publicUrl: string;
  };
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

/** Reads a PEM from an inline variable (with escaped newlines) or from a file path. */
function readPem(inline: string | undefined, path: string | undefined): string {
  if (inline) return inline.replace(/\\n/g, '\n');
  if (!path) return '';
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

export default function configuration(): AppConfig {
  const env = (process.env.NODE_ENV ?? 'development') as NodeEnv;
  const dataKeys = [process.env.DATA_ENCRYPTION_KEY, process.env.DATA_ENCRYPTION_KEY_PREVIOUS]
    .filter((key): key is string => Boolean(key))
    .map(toEncryptionKey);

  return {
    env,
    isProduction: env === 'production',
    port: toInt(process.env.API_PORT, 4000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: toInt(process.env.TRUST_PROXY, 0),
    demoMode: toBool(process.env.DEMO_MODE, false),
    seedDemoData: toBool(process.env.SEED_DEMO_DATA, false),
    mongo: {
      uri: process.env.MONGODB_URI ?? '',
    },
    throttle: {
      ttlMs: toInt(process.env.THROTTLE_TTL_SECONDS, 60) * 1000,
      limit: toInt(process.env.THROTTLE_LIMIT, 300),
    },
    auth: {
      jwtPrivateKeyPem: readPem(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH),
      jwtPublicKeyPem: readPem(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH),
      issuer: process.env.JWT_ISSUER ?? 'vinaybank-api',
      audience: process.env.JWT_AUDIENCE ?? 'vinaybank-web',
      accessTtlSeconds: toInt(process.env.JWT_ACCESS_TTL_SECONDS, 900),
      refreshTtlDays: toInt(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
      bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
      maxLoginAttempts: toInt(process.env.MAX_LOGIN_ATTEMPTS, 5),
      lockoutMinutes: toInt(process.env.LOCKOUT_MINUTES, 15),
      cookieSecure: toBool(process.env.COOKIE_SECURE, env === 'production'),
    },
    security: {
      dataKeys,
      blindIndexKey: Buffer.from(process.env.BLIND_INDEX_KEY ?? '', 'base64'),
      appHmacKey: Buffer.from(process.env.APP_HMAC_KEY ?? '', 'base64'),
    },
    banking: {
      beneficiaryCoolingHours: Number(process.env.BENEFICIARY_COOLING_HOURS ?? 24),
      highValueThresholdPaise: toInt(process.env.HIGH_VALUE_THRESHOLD_RUPEES, 200_000) * 100,
      neftSettlementSeconds: toInt(process.env.NEFT_SETTLEMENT_SECONDS, 60),
      schedulersEnabled: toBool(process.env.SCHEDULERS_ENABLED, env !== 'test'),
    },
    integrations: {
      ifscApiUrl: process.env.IFSC_API_URL ?? 'https://ifsc.razorpay.com',
      forexApiUrl: process.env.FOREX_API_URL ?? 'https://api.frankfurter.dev/v1',
      httpTimeoutMs: toInt(process.env.EXTERNAL_HTTP_TIMEOUT_MS, 4000),
    },
    cards: loadCardNetworkConfig(process.env),
    riskEngine: {
      enabled: toBool(process.env.RISK_ENGINE_ENABLED, env !== 'test'),
      url: (process.env.RISK_ENGINE_URL ?? 'http://127.0.0.1:8085').replace(/\/$/, ''),
      apiKey: process.env.RISK_ENGINE_API_KEY ?? '',
      timeoutMs: toInt(process.env.RISK_ENGINE_TIMEOUT_MS, 800),
      failureThreshold: toInt(process.env.RISK_ENGINE_FAILURE_THRESHOLD, 3),
      cooldownMs: toInt(process.env.RISK_ENGINE_COOLDOWN_MS, 30_000),
    },
    ledger: {
      type: process.env.LEDGER_DB_TYPE === 'oracle' ? 'oracle' : 'sqljs',
      sqlitePath: process.env.LEDGER_SQLITE_PATH ?? (env === 'test' ? '' : '.data/ledger.sqlite'),
      oracle: {
        connectString: process.env.LEDGER_ORACLE_CONNECT_STRING ?? '',
        username: process.env.LEDGER_ORACLE_USER ?? '',
        password: process.env.LEDGER_ORACLE_PASSWORD ?? '',
      },
    },
    soap: {
      username: process.env.SOAP_USERNAME ?? 'erp-partner',
      password: process.env.SOAP_PASSWORD ?? '',
      customerEmail: (process.env.SOAP_CUSTOMER_EMAIL ?? 'priya@example.com').toLowerCase(),
      publicUrl: process.env.SOAP_PUBLIC_URL ?? '',
    },
  };
}
