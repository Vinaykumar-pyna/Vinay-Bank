/**
 * PM2 alternative to systemd (pm2 start deploy/pm2/ecosystem.config.cjs).
 *
 * The API runs as one process on purpose: Socket.IO needs sticky sessions and
 * a shared adapter (for example Redis) to span several processes, and the
 * SQLite ledger (sql.js) belongs to a single process. To scale out, move the
 * ledger to Oracle, add the Socket.IO Redis adapter and then use cluster mode.
 */
module.exports = {
  apps: [
    {
      name: 'arthabank-api',
      cwd: './backend',
      script: 'dist/apps/api/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      kill_timeout: 30000,
    },
    {
      name: 'arthabank-switch',
      cwd: './backend',
      script: 'dist/apps/card-switch/main.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'arthabank-risk',
      cwd: './services/risk-engine',
      script: 'java',
      args: ['-jar', 'target/risk-engine-1.0.0.jar'],
      interpreter: 'none',
      instances: 1,
    },
  ],
};
