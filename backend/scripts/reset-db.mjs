#!/usr/bin/env node
/**
 * Drops the development database (and the SQLite general ledger built from it)
 * so the API re-seeds demo data on its next start.
 * Refuses to run when NODE_ENV=production.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(backendDir, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

if ((process.env.NODE_ENV ?? env.NODE_ENV) === 'production') {
  console.error('[reset-db] Refusing to drop a production database.');
  process.exit(1);
}

const uri = process.env.MONGODB_URI ?? env.MONGODB_URI;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db();
await db.dropDatabase();
// The ledger is a projection of MongoDB: rebuild it from scratch with the new data.
const ledgerPath = resolve(backendDir, env.LEDGER_SQLITE_PATH || '.data/ledger.sqlite');
if (existsSync(ledgerPath)) {
  rmSync(ledgerPath);
  console.log('[reset-db] Removed the SQLite general ledger; it is rebuilt on the next start.');
}
console.log(
  `[reset-db] Dropped database "${db.databaseName}". Restart the API to re-seed demo data.`,
);
await client.close();
