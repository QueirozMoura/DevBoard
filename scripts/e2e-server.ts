import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

// Never reuse DATABASE_URL: browser tests only connect to an explicitly isolated test DB.
try {
  process.loadEnvFile('.env');
} catch {
  /* CI supplies its own environment. */
}
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://devboard:change-me@localhost:5433/devboard_test',
  JWT_SECRET: randomBytes(32).toString('hex'),
  HOST: '127.0.0.1',
  PORT: '3101',
  LOG_LEVEL: 'silent',
  CORS_ORIGIN: 'http://127.0.0.1:5174',
  RATE_LIMIT_AUTH_MAX: '10000',
  RATE_LIMIT_USER_MAX: '10000',
});
const app = buildApp(env);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
await app.listen({ host: env.HOST, port: env.PORT });
