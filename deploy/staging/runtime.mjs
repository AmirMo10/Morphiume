import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const allowed = new Set([
  'DATABASE_URL', 'AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET',
  'APP_BASE_URL', 'MEDIA_ROOT', 'PAYMENT_PROVIDER', 'SMS_PROVIDER', 'ANONYMOUS_ANALYTICS_ENABLED',
]);

try {
  if (process.env.DEPLOYMENT_ENV !== 'staging') {
    throw new Error('This image launcher requires DEPLOYMENT_ENV=staging.');
  }
  const file = process.env.MORPHIUME_RUNTIME_CONFIG;
  if (!file) throw new Error('A dedicated staging runtime config file is required.');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Staging runtime config must be a JSON object.');
  }
  // Explicit staging opt-in only; an inherited host variable cannot activate it.
  process.env.ANONYMOUS_ANALYTICS_ENABLED = 'false';
  if (Object.hasOwn(config, 'ANONYMOUS_ANALYTICS_ENABLED') && !['true', 'false'].includes(config.ANONYMOUS_ANALYTICS_ENABLED)) {
    throw new Error('Invalid anonymous analytics activation setting.');
  }
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.has(key) || typeof value !== 'string' || value.includes('\0')) {
      throw new Error('Invalid staging runtime configuration key or value.');
    }
    process.env[key] = value;
  }
  if (!process.env.DATABASE_URL) throw new Error('Staging DATABASE_URL is required.');
  if (process.env.PAYMENT_PROVIDER !== 'mock' || process.env.SMS_PROVIDER !== 'mock') {
    throw new Error('This staging launcher permits mock payment and SMS only.');
  }
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error('A runtime command is required.');
  const processGroup = process.platform !== 'win32';
  const child = spawn(command, args, { stdio: 'inherit', env: process.env, detached: processGroup, windowsHide: true });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      try {
        if (processGroup && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // The process may already have exited while Docker requested shutdown.
      }
    });
  }
  child.on('error', () => {
    console.error('Staging process could not start.');
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal === 'SIGTERM' ? 0 : 1));
  });
} catch (error) {
  // Configuration values and parse errors may contain secrets: do not print them.
  console.error(error instanceof SyntaxError ? 'Invalid staging JSON configuration.' : error.message);
  process.exit(1);
}
