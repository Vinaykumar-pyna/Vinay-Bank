import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

/**
 * Starts one in-memory MongoDB replica set for the whole e2e run.
 * A replica set (not a standalone server) is required for multi-document transactions.
 */
export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.waitUntilRunning();
  process.env.E2E_MONGO_URI = replSet.getUri();

  // Fresh mutual-TLS certificates for the card network tests (never the developer's own).
  const tlsDir = mkdtempSync(join(tmpdir(), 'arthabank-e2e-tls-'));
  execFileSync(process.execPath, [resolve(__dirname, '../../../../scripts/gen-tls.mjs'), tlsDir]);
  process.env.E2E_TLS_DIR = tlsDir;
  (globalThis as { __MONGO_REPLSET__?: MongoMemoryReplSet }).__MONGO_REPLSET__ = replSet;
}
