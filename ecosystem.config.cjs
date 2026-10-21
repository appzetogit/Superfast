// PM2 process file. Backend is ESM ("type": "module"), so this must stay .cjs.
// Start:   pm2 start ecosystem.config.cjs
// Reload:  pm2 reload ecosystem.config.cjs --update-env
//
// Which processes start is decided from Backend/.env:
//   - always:                          superfast-api    (server.js, PORT, default 5000)
//   - SOCKET_STANDALONE=true:          superfast-socket (socket.js, SOCKET_PORT, default 5001)
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
  max_restarts: 10,
  restart_delay: 3000,
  time: true,
};

const worker = (name) => ({
  ...base,
  name: `superfast-worker-${name}`,
  script: `src/queues/workers/${name}.worker.js`,
  max_memory_restart: '300M',
});

const apps = [
  {
    ...base,
    name: 'superfast-api',
    script: 'server.js',
    max_memory_restart: '700M',
    kill_timeout: 12000, // server.js graceful shutdown allows 10s
  },
];

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
