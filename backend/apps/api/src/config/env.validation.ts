import Joi from 'joi';

/** A base64 string that decodes to exactly 32 bytes (a 256-bit key). */
const base64Key256 = Joi.string()
  .base64()
  .custom((value: string, helpers) =>
    Buffer.from(value, 'base64').length === 32 ? value : helpers.error('any.invalid'),
  )
  .messages({ 'any.invalid': '{{#label}} must be a base64-encoded 32-byte key' });

const booleanish = Joi.boolean().truthy('true', '1', 'yes').falsy('false', '0', 'no');

/**
 * Fail-fast validation of environment variables at startup.
 * A misconfigured deployment refuses to boot instead of failing later at runtime.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().port().default(4000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  DEMO_MODE: booleanish.default(false),
  SEED_DEMO_DATA: booleanish.default(false),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(300),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().min(1).default(10),

  // JWT signing keys: inline PEM (JWT_PRIVATE_KEY) or a file path (JWT_PRIVATE_KEY_PATH).
  JWT_PRIVATE_KEY: Joi.string(),
  JWT_PRIVATE_KEY_PATH: Joi.string(),
  JWT_PUBLIC_KEY: Joi.string(),
  JWT_PUBLIC_KEY_PATH: Joi.string(),
  JWT_ISSUER: Joi.string().default('arthabank-api'),
  JWT_AUDIENCE: Joi.string().default('arthabank-web'),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(7),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(12),
  MAX_LOGIN_ATTEMPTS: Joi.number().integer().min(3).max(20).default(5),
  LOCKOUT_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  COOKIE_SECURE: booleanish,

  DATA_ENCRYPTION_KEY: base64Key256.required(),
  DATA_ENCRYPTION_KEY_PREVIOUS: base64Key256,
  BLIND_INDEX_KEY: base64Key256.required(),
  APP_HMAC_KEY: base64Key256.required(),

  BENEFICIARY_COOLING_HOURS: Joi.number().min(0).max(168).default(24),
  HIGH_VALUE_THRESHOLD_RUPEES: Joi.number().integer().min(1000).default(200000),
  NEFT_SETTLEMENT_SECONDS: Joi.number().integer().min(5).max(3600).default(60),
  SCHEDULERS_ENABLED: booleanish,

  IFSC_API_URL: Joi.string().uri().default('https://ifsc.razorpay.com'),
  FOREX_API_URL: Joi.string().uri().default('https://api.frankfurter.dev/v1'),
  EXTERNAL_HTTP_TIMEOUT_MS: Joi.number().integer().min(500).max(30000).default(4000),

  CARD_BIN: Joi.string()
    .pattern(/^\d{6}$/)
    .default('652845'),
  CARD_SWITCH_HOST: Joi.string().default('127.0.0.1'),
  CARD_SWITCH_PORT: Joi.number().port().default(5800),
  CORE_RPC_HOST: Joi.string().default('127.0.0.1'),
  CORE_RPC_PORT: Joi.number().port().default(4001),
  CARD_NETWORK_TIMEOUT_MS: Joi.number().integer().min(500).max(60000).default(8000),
  CARD_ZPK_ACQUIRER: Joi.string()
    .pattern(/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48})$/)
    .required(),
  CARD_ZPK_ISSUER: Joi.string()
    .pattern(/^([0-9a-fA-F]{32}|[0-9a-fA-F]{48})$/)
    .required(),
  CARD_MAC_KEY: base64Key256.required(),
  CARD_PVK: base64Key256.required(),
  CARD_CVK: base64Key256.required(),
  TLS_CA_PATH: Joi.string(),
  TLS_SERVER_CERT_PATH: Joi.string(),
  TLS_SERVER_KEY_PATH: Joi.string(),
  TLS_CLIENT_CERT_PATH: Joi.string(),
  TLS_CLIENT_KEY_PATH: Joi.string(),

  RISK_ENGINE_ENABLED: booleanish,
  RISK_ENGINE_URL: Joi.string().uri().default('http://127.0.0.1:8085'),
  RISK_ENGINE_API_KEY: Joi.string().allow(''),
  RISK_ENGINE_TIMEOUT_MS: Joi.number().integer().min(100).max(10000).default(800),
  RISK_ENGINE_FAILURE_THRESHOLD: Joi.number().integer().min(1).max(50).default(3),
  RISK_ENGINE_COOLDOWN_MS: Joi.number().integer().min(100).max(600000).default(30000),

  LEDGER_DB_TYPE: Joi.string().valid('sqljs', 'oracle').default('sqljs'),
  LEDGER_SQLITE_PATH: Joi.string().allow(''),
  LEDGER_ORACLE_CONNECT_STRING: Joi.string().allow(''),
  LEDGER_ORACLE_USER: Joi.string().allow(''),
  LEDGER_ORACLE_PASSWORD: Joi.string().allow(''),

  SOAP_USERNAME: Joi.string().min(3).max(64).default('erp-partner'),
  SOAP_PASSWORD: Joi.string().min(16),
  SOAP_CUSTOMER_EMAIL: Joi.string().email().default('priya@example.com'),
  SOAP_PUBLIC_URL: Joi.string().uri().allow(''),
})
  .or('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_PATH')
  .or('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_PATH');
