import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = loadEnv();
const app = buildApp(env);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'encerrando servidor');

  const timer = setTimeout(() => {
    app.log.error('timeout no encerramento; forçando saída');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  try {
    await app.close(); // para de aceitar conexões e executa os hooks onClose
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'falha ao encerrar');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'unhandledRejection');
  void shutdown('unhandledRejection');
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.fatal({ err }, 'falha ao iniciar');
  process.exit(1);
}
