#!/usr/bin/env node
/**
 * Prepares a local development environment. Safe to run repeatedly (idempotent):
 *  1. Creates backend/.env from .env.example, generating strong random secrets for
 *     every __RANDOM_*__ placeholder. Keys added to .env.example later are appended
 *     to an existing .env without touching values you already have.
 *  2. Generates the RSA-2048 key pair used to sign JWT access tokens (RS256).
 *  3. Generates a development certificate authority with server and client
 *     certificates for mutual TLS on the card network (ISO 8583 switch).
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TLS_FILES, writeDevPki } from './lib/dev-pki.mjs';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envExamplePath = join(backendDir, '.env.example');
const envPath = join(backendDir, '.env');
const secretsDir = join(backendDir, '.secrets');

const generators = {
  __RANDOM_BASE64_32__: () => randomBytes(32).toString('base64'),
  __RANDOM_HEX_16__: () => randomBytes(16).toString('hex'),
  __RANDOM_HEX_24__: () => randomBytes(24).toString('hex'),
  __RANDOM_HEX_32__: () => randomBytes(32).toString('hex'),
  __RANDOM_SECRET__: () => randomBytes(24).toString('base64url'),
};

const log = (msg) => console.log(`[setup] ${msg}`);

/** Returns [key, value] for `KEY=value` lines, or null for comments/blank lines. */
function parseLine(line) {
  const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
  return match ? [match[1], match[2].trim()] : null;
}

function fillPlaceholder(value) {
  return value.replace(/__RANDOM_[A-Z0-9_]+__/g, (token) => {
    const generate = generators[token];
    if (!generate) throw new Error(`Unknown placeholder ${token} in .env.example`);
    return generate();
  });
}

function setupEnvFile() {
  const exampleLines = readFileSync(envExamplePath, 'utf8').split(/\r?\n/);

  if (!existsSync(envPath)) {
    const output = exampleLines.map((line) => {
      const parsed = parseLine(line);
      return parsed ? `${parsed[0]}=${fillPlaceholder(parsed[1])}` : line;
    });
    writeFileSync(envPath, output.join('\n'), { mode: 0o600 });
    log('Created backend/.env with freshly generated secrets');
    return;
  }

  const existingKeys = new Set(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map(parseLine)
      .filter(Boolean)
      .map(([key]) => key),
  );
  const missing = exampleLines
    .map(parseLine)
    .filter((parsed) => parsed && !existingKeys.has(parsed[0]))
    .map(([key, value]) => `${key}=${fillPlaceholder(value)}`);

  if (missing.length === 0) {
    log('backend/.env is up to date');
    return;
  }
  const current = readFileSync(envPath, 'utf8').replace(/\s*$/, '');
  const appended = `${current}\n\n# Added by setup on ${new Date().toISOString()}\n${missing.join('\n')}\n`;
  writeFileSync(envPath, appended, { mode: 0o600 });
  log(`Added ${missing.length} new setting(s) to backend/.env`);
}

function setupJwtKeys() {
  const privatePath = join(secretsDir, 'jwt-private.pem');
  const publicPath = join(secretsDir, 'jwt-public.pem');
  if (existsSync(privatePath) && existsSync(publicPath)) {
    log('JWT signing keys already exist');
    return;
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(publicPath, publicKey);
  log('Generated RSA-2048 key pair for JWT signing (.secrets/jwt-*.pem)');
}

async function setupTlsCertificates() {
  const tlsDir = join(secretsDir, 'tls');
  if (TLS_FILES.every((file) => existsSync(join(tlsDir, file)))) {
    log('Card network TLS certificates already exist');
    return;
  }
  await writeDevPki(tlsDir);
  log('Generated a development CA with mutual-TLS certificates (.secrets/tls)');
}

mkdirSync(secretsDir, { recursive: true });
setupEnvFile();
setupJwtKeys();
await setupTlsCertificates();
log('Done.');
