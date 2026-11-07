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
  } catch {
    app.log.error({ code: 'SHUTDOWN_ERROR' }, 'falha ao encerrar');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', () => {
  app.log.fatal({ code: 'UNHANDLED_REJECTION' }, 'unhandledRejection');
  void shutdown('unhandledRejection');
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch {
  app.log.fatal({ code: 'STARTUP_ERROR' }, 'falha ao iniciar');
  process.exit(1);
}
