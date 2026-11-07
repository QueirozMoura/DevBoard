import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

// Os testes SEMPRE usam o banco de teste (porta 5433, banco devboard_test),
// nunca o DATABASE_URL de desenvolvimento definido no ambiente/.env.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devboard:change-me@localhost:5433/devboard_test';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // testes de integração compartilham o mesmo banco
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      // Chave efêmera exclusiva dos testes; nunca reutiliza a chave de desenvolvimento.
      JWT_SECRET: randomBytes(32).toString('hex'),
      JWT_ISSUER: 'devboard-api-test',
      JWT_AUDIENCE: 'devboard-client-test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
  },
});
