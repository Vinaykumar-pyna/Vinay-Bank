#!/usr/bin/env node
/**
 * Starts a local single-node MongoDB replica set for development, with no MongoDB install.
 *
 * Why a replica set? Fund transfers use multi-document ACID transactions
 * (debit + credit + postings commit together or not at all), and MongoDB only
 * supports transactions on replica sets or sharded clusters.
 *
 * The official `mongod` binary is downloaded once by mongodb-memory-server
 * and data is persisted in backend/.data/mongo, so it survives restarts.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { MongoBinary } from 'mongodb-memory-server-core';

const PORT = Number(process.env.MONGO_DEV_PORT ?? 27018);
const REPLICA_SET = 'rs0';
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(backendDir, '.data');
const dbPath = join(dataDir, 'mongo');
const logPath = join(dataDir, 'mongod.log');

const log = (msg) => console.log(`[mongo] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPortOpen(port) {
  return new Promise((resolvePort) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.end();
      resolvePort(true);
    });
    socket.once('error', () => resolvePort(false));
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await sleep(250);
  }
  throw new Error(`mongod did not open port ${port} within ${timeoutMs / 1000}s (see ${logPath})`);
}

async function ensureReplicaSet() {
  const client = new MongoClient(`mongodb://127.0.0.1:${PORT}/?directConnection=true`, {
    serverSelectionTimeoutMS: 30_000,
  });
  await client.connect();
  try {
    const admin = client.db('admin');
    try {
      await admin.command({ replSetGetStatus: 1 });
    } catch (err) {
      if (err?.code !== 94 && err?.codeName !== 'NotYetInitialized') throw err;
      await admin.command({
        replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] },
      });
      log(`Initiated replica set "${REPLICA_SET}"`);
    }
    for (let i = 0; i < 120; i++) {
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary) return;
      await sleep(500);
    }
    throw new Error('Replica set did not elect a primary in time');
  } finally {
    await client.close();
  }
}

async function shutdownMongod() {
  const client = new MongoClient(`mongodb://127.0.0.1:${PORT}/?directConnection=true`, {
    serverSelectionTimeoutMS: 2_000,
  });
  try {
    await client.connect();
    await client.db('admin').command({ shutdown: 1, force: true });
  } catch {
    // Expected: the server closes the connection while shutting down.
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function main() {
  mkdirSync(dbPath, { recursive: true });

  if (await isPortOpen(PORT)) {
    log(`Port ${PORT} is already in use; assuming a MongoDB instance is running there.`);
    await ensureReplicaSet();
    log(`Ready: mongodb://127.0.0.1:${PORT}/arthabank?replicaSet=${REPLICA_SET}`);
    setInterval(() => undefined, 1 << 30); // stay alive so `concurrently` keeps the group running
    return;
  }

  log(
    'Resolving the mongod binary (the first run downloads it once; this can take a few minutes)...',
  );
  const binary = await MongoBinary.getPath();
  log(`Using ${binary}`);

  const child = spawn(
    binary,
    [
      '--replSet',
      REPLICA_SET,
      '--port',
      String(PORT),
      '--bind_ip',
      '127.0.0.1',
      '--dbpath',
      dbPath,
      '--logpath',
      logPath,
      '--logappend',
    ],
    { stdio: 'inherit' },
  );

  let stopping = false;
  child.on('exit', (code) => {
    if (!stopping) log(`mongod exited unexpectedly with code ${code}. Check ${logPath}`);
    process.exit(code ?? 0);
  });

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    log('Shutting down mongod...');
    await shutdownMongod();
    setTimeout(() => child.kill(), 5_000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await waitForPort(PORT, 60_000);
  await ensureReplicaSet();
  log(`Ready: mongodb://127.0.0.1:${PORT}/arthabank?replicaSet=${REPLICA_SET}`);
  log(`Data directory: ${dbPath}`);
}

main().catch((err) => {
  console.error(`[mongo] Failed to start: ${err?.message ?? err}`);
  process.exit(1);
});
