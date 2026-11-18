#!/usr/bin/env node
/**
 * Tamper demo: simulates an insider who edits history directly in MongoDB,
 * bypassing the API. Afterwards, Audit trail -> "Verify integrity" in the staff
 * portal (or GET /api/v1/audit/verify) reports the exact record that changed.
 *
 *   node scripts/demo-tamper-audit.mjs            tamper with one audit record
 *   node scripts/demo-tamper-audit.mjs --restore  put the original value back
 */
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupPath = join(backendDir, '.data', 'audit-tamper-backup.json');
const env = Object.fromEntries(
  readFileSync(join(backendDir, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

if ((process.env.NODE_ENV ?? env.NODE_ENV) === 'production') {
  console.error('[tamper] Refusing to run against production.');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI ?? env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const logs = client.db().collection('audit_logs');

if (process.argv.includes('--restore')) {
  if (!existsSync(backupPath)) {
    console.log('[tamper] Nothing to restore.');
  } else {
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    await logs.updateOne({ seq: backup.seq }, { $set: { details: backup.details, action: backup.action } });
    rmSync(backupPath);
    console.log(`[tamper] Restored audit record #${backup.seq}. The chain verifies again.`);
  }
} else {
  if (existsSync(backupPath)) {
    console.log('[tamper] A tampered record already exists. Run with --restore first.');
    await client.close();
    process.exit(0);
  }
  const target =
    (await logs.find({ action: { $in: ['TRANSFER_COMPLETED', 'CASH_DEPOSIT'] } }).sort({ seq: -1 }).limit(1).next()) ??
    (await logs.find().sort({ seq: -1 }).skip(3).limit(1).next());
  if (!target) {
    console.log('[tamper] No audit records yet. Use the app first.');
  } else {
    mkdirSync(dirname(backupPath), { recursive: true });
    writeFileSync(backupPath, JSON.stringify({ seq: target.seq, details: target.details, action: target.action }));
    const forged = { ...(target.details ?? {}), amount: 1, note: 'edited directly in the database' };
    await logs.updateOne({ _id: target._id }, { $set: { details: forged } });
    console.log(`[tamper] Changed audit record #${target.seq} (${target.action}) directly in MongoDB.`);
    console.log('[tamper] Now open Staff portal -> Audit trail -> Verify integrity.');
  }
}
await client.close();
