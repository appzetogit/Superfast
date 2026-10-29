// PM2 process file. Backend is ESM ("type": "module"), so this must stay .cjs.
// Start:   pm2 start ecosystem.config.cjs
// Reload:  pm2 reload ecosystem.config.cjs --update-env
//
// Which processes start is decided from Backend/.env:
//   - always:                          superfast-api    (server.js, PORT, default 5000)
//   - SOCKET_STANDALONE=true:          superfast-socket (socket.js, SOCKET_PORT, default 5001)
//                                      + API runs as a CLUSTER (API_INSTANCES, default 'max') and cron/watchdog
//                                      jobs move to one dedicated superfast-jobs process (JOBS_PORT, default 5100)
//   - BULLMQ_ENABLED=true:             one process per BullMQ worker
// SOCKET_STANDALONE and BULLMQ_ENABLED both need REDIS_ENABLED=true and a reachable REDIS_URL.
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, 'Backend');

const readEnvFlags = () => {
  try {
    const raw = fs.readFileSync(path.join(backendDir, '.env'), 'utf8');
    const flags = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*)"?/);
      if (m) flags[m[1]] = m[2].trim();
    }
    return flags;
  } catch {
    return {};
  }
};

const envFlags = readEnvFlags();
const isOn = (key) => String(process.env[key] ?? envFlags[key] ?? '').toLowerCase() === 'true';

const base = {
  cwd: backendDir,
  env: { NODE_ENV: 'production' },
  autorestart: true,
  // Keep retrying after a crash (backoff up to 15s) instead of giving up after 10 restarts,
  // which is what leaves nginx answering 502 until someone logs in to the server.
  max_restarts: 1000,
  min_uptime: '10s',
  exp_backoff_restart_delay: 200,
  time: true,
};

const worker = (name) => ({
  ...base,
  name: `superfast-worker-${name}`,
  script: `src/queues/workers/${name}.worker.js`,
  max_memory_restart: '300M',
});

// More than one API process is only safe when sockets live in their own process (shared via Redis),
// and when cron/watchdog jobs run once (not once per API instance).
const clustered = isOn('SOCKET_STANDALONE') && isOn('REDIS_ENABLED');

const apps = [
  {
    ...base,
    name: 'superfast-api',
    script: 'server.js',
    max_memory_restart: '700M',
    kill_timeout: 12000, // server.js graceful shutdown allows 10s
    ...(clustered && {
      exec_mode: 'cluster',
      instances: process.env.API_INSTANCES || 'max',
      env: { NODE_ENV: 'production', BACKGROUND_JOBS: 'false' },
    }),
  },
];

if (clustered) {
  apps.push({
    ...base,
    name: 'superfast-jobs',
    script: 'server.js',
    max_memory_restart: '700M',
    kill_timeout: 12000,
    env: { NODE_ENV: 'production', BACKGROUND_JOBS: 'true', PORT: process.env.JOBS_PORT || '5100' },
  });
}

if (isOn('SOCKET_STANDALONE')) {
  apps.push({
    ...base,
    name: 'superfast-socket',
    script: 'socket.js',
    max_memory_restart: '700M',
    kill_timeout: 12000,
  });
}

if (isOn('BULLMQ_ENABLED')) {
  apps.push(
    worker('otp'),
    worker('notification'),
    worker('order'),
    worker('tracking'),
    worker('payment'),
  );
}

module.exports = { apps };
