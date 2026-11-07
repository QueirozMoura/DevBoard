import { defineConfig } from 'prisma/config';

/**
 * Seleção explícita do banco-alvo, com guardas contra uso do banco errado:
 *  - padrão (desenvolvimento): DATABASE_URL, cujo banco NÃO pode terminar em "_test";
 *  - PRISMA_TARGET=test:       TEST_DATABASE_URL, cujo banco DEVE terminar em "_test".
 * As variáveis vêm do ambiente; em desenvolvimento local, do arquivo .env.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // sem .env (ex.: CI): usa apenas o ambiente do processo
}

const isTest = process.env.PRISMA_TARGET === 'test';
const varName = isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
const url = process.env[varName];

// `prisma generate` não precisa de banco; os demais comandos exigem a URL.
if (url) {
  const dbName = new URL(url).pathname.slice(1);
  if (isTest !== dbName.endsWith('_test')) {
    throw new Error(
      isTest
        ? 'PRISMA_TARGET=test exige que TEST_DATABASE_URL aponte para um banco terminado em "_test".'
        : 'DATABASE_URL (desenvolvimento) não pode apontar para um banco terminado em "_test".',
    );
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: url ?? 'postgresql://placeholder@localhost:5432/placeholder' },
});
