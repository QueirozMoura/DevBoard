import { defineConfig } from 'vitest/config';

// Os testes SEMPRE usam o banco de teste (porta 5433, banco devboard_test),
// nunca o DATABASE_URL de desenvolvimento definido no ambiente/.env.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devboard:change-me@localhost:5433/devboard_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
  },
});
