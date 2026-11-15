#!/usr/bin/env node
/**
 * Runs the Java risk engine through the Maven Wrapper, with the shared API key
 * and port taken from backend/.env.
 *
 *   node services/risk-engine/run-dev.mjs          start it (spring-boot:run)
 *   node services/risk-engine/run-dev.mjs test     run the JUnit tests
 *
 * Without a JDK 21+ it prints a notice and exits cleanly: the core banking API
 * then scores transfers with its built-in fallback rules.
 */
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../backend/.env');
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()]),
    )
  : {};

const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
const major = Number(/version "(\d+)/.exec(`${java.stderr}${java.stdout}`)?.[1] ?? 0);
if (java.error || java.status !== 0 || major < 21) {
  console.log(
    `[risk] ${major ? `Java ${major} found, but Java 21 or newer is needed` : 'Java was not found'}. ` +
      'The API will use its built-in fallback rules instead of the Java risk engine.',
  );
  process.exit(0);
}

/**
 * On Windows the JDK builds its internal NIO wake-up pipe from a Unix-domain
 * socket in the temp folder, and that connect fails when the path contains a
 * space (for example a user name like "Vinay kumar"): Tomcat then cannot start
 * ("Unable to establish loopback connection"). Point the JDK at a socket
 * directory without spaces.
 */
function socketDirFlag() {
  if (process.platform !== 'win32' || !/[\s~]/.test(tmpdir())) return [];
  const candidates = [join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp'), 'C:\\Users\\Public'];
  const usable = candidates.find((dir) => {
    try {
      accessSync(dir, constants.W_OK);
      return !/\s/.test(dir);
    } catch {
      return false;
    }
  });
  return usable ? [`-Dspring-boot.run.jvmArguments=-Djdk.net.unixdomain.tmpdir=${usable}`] : [];
}

const testing = process.argv[2] === 'test';
const goal = testing ? ['-B', 'test'] : ['-q', 'spring-boot:run', ...socketDirFlag()];
const port = new URL(env.RISK_ENGINE_URL ?? 'http://127.0.0.1:8085').port || '8085';
const options = {
  cwd: here,
  stdio: 'inherit',
  env: {
    ...process.env,
    RISK_ENGINE_API_KEY: env.RISK_ENGINE_API_KEY ?? '',
    RISK_ENGINE_PORT: port,
  },
};
// Windows runs .cmd files only through a shell; the command line is fixed text (no user input).
const child =
  process.platform === 'win32'
    ? spawn(`"${resolve(here, 'mvnw.cmd')}" ${goal.join(' ')}`, { ...options, shell: true })
    : spawn(resolve(here, 'mvnw'), goal, options);
child.on('exit', (code) => {
  if (testing) process.exit(code ?? 0);
  // The engine is optional: never take the rest of the dev stack down with it.
  if (code)
    console.log(
      `[risk] The risk engine stopped (exit code ${code}). The API keeps scoring with its fallback rules.`,
    );
  process.exit(0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
