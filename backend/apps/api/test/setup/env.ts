import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';

/**
 * Runs before each e2e test file is loaded. Every test file gets its own
 * database inside the shared replica set, so files cannot interfere.
 * Keys and secrets are generated per run: tests never depend on local files.
 */
const baseUri = process.env.E2E_MONGO_URI;
if (!baseUri) throw new Error('E2E_MONGO_URI missing: global setup did not run');

const uri = new URL(baseUri);
uri.pathname = `/vinaybank_e2e_${randomUUID().slice(0, 8)}`;

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = uri.toString();
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.THROTTLE_LIMIT = '100000';
process.env.AUTH_THROTTLE_LIMIT = '100000';
process.env.DEMO_MODE = 'true';
process.env.SEED_DEMO_DATA = 'false';
process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests only
process.env.MAX_LOGIN_ATTEMPTS = '5';
process.env.LOCKOUT_MINUTES = '15';
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.BLIND_INDEX_KEY = randomBytes(32).toString('base64');
process.env.APP_HMAC_KEY = randomBytes(32).toString('base64');
process.env.SCHEDULERS_ENABLED = 'false';
process.env.BENEFICIARY_COOLING_HOURS = '24';
process.env.NEFT_SETTLEMENT_SECONDS = '5';
// External HTTP calls must not slow tests down: point at a closed port so the offline fallback is used.
process.env.IFSC_API_URL = 'http://127.0.0.1:9';
process.env.FOREX_API_URL = 'http://127.0.0.1:9';
process.env.EXTERNAL_HTTP_TIMEOUT_MS = '500';

// Card network: random keys per run, test-only ports and certificates from global setup.
const tlsDir = process.env.E2E_TLS_DIR;
if (!tlsDir) throw new Error('E2E_TLS_DIR missing: global setup did not run');
process.env.CARD_BIN = '652845';
process.env.CARD_SWITCH_HOST = '127.0.0.1';
process.env.CARD_SWITCH_PORT = String(15800 + Number(process.env.JEST_WORKER_ID ?? 1));
process.env.CORE_RPC_HOST = '127.0.0.1';
process.env.CORE_RPC_PORT = String(14000 + Number(process.env.JEST_WORKER_ID ?? 1));
process.env.CARD_NETWORK_TIMEOUT_MS = '4000';
process.env.CARD_ZPK_ACQUIRER = randomBytes(16).toString('hex');
process.env.CARD_ZPK_ISSUER = randomBytes(16).toString('hex');
process.env.CARD_MAC_KEY = randomBytes(32).toString('base64');
process.env.CARD_PVK = randomBytes(32).toString('base64');
process.env.CARD_CVK = randomBytes(32).toString('base64');
process.env.TLS_CA_PATH = `${tlsDir}/ca.pem`;
process.env.TLS_SERVER_CERT_PATH = `${tlsDir}/server.pem`;
process.env.TLS_SERVER_KEY_PATH = `${tlsDir}/server-key.pem`;
process.env.TLS_CLIENT_CERT_PATH = `${tlsDir}/client.pem`;
process.env.TLS_CLIENT_KEY_PATH = `${tlsDir}/client-key.pem`;
