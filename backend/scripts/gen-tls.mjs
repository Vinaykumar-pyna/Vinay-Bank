#!/usr/bin/env node
/** Generates a development CA and mutual-TLS certificates: node scripts/gen-tls.mjs <output dir> */
import { resolve } from 'node:path';
import { writeDevPki } from './lib/dev-pki.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/gen-tls.mjs <output directory>');
  process.exit(1);
}
await writeDevPki(resolve(dir));
console.log(`[tls] Wrote CA, server and client certificates to ${resolve(dir)}`);
