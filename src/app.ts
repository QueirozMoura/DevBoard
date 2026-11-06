import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { registerErrorHandling } from './plugins/errors.js';

/**
 * Monta a aplicação sem iniciar o servidor (facilita testes com app.inject()).
 * Recursos com ciclo de vida (banco, etc.) devem registrar hooks `onClose`,
 * de modo que `app.close()` encerre tudo de forma ordenada.
 */
export function buildApp(env: Env): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
    },
  });

  registerErrorHandling(app);
  void app.register(healthRoutes);

  return app;
}
