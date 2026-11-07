import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { registerAuthentication } from './plugins/authentication.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerPrisma } from './plugins/prisma.js';

/**
 * Monta a aplicação sem iniciar o servidor (facilita testes com app.inject()).
 * Recursos com ciclo de vida (banco, etc.) devem registrar hooks `onClose`,
 * de modo que `app.close()` encerre tudo de forma ordenada.
 */
export function buildApp(
  env: Env,
  logStream?: { write(message: string): void },
): FastifyInstance {
  const app = Fastify({
    logger: {
      ...(logStream ? { stream: logStream } : {}),
      level: env.LOG_LEVEL,
      serializers: {
        req(request: FastifyRequest) {
          // Parâmetros de query podem conter tokens enviados indevidamente.
          return { method: request.method, url: request.url.split('?')[0] ?? '' };
        },
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body',
          'body',
          'password',
          'passwordHash',
          'accessToken',
          'refreshToken',
          'token',
          'JWT_SECRET',
          'secret',
        ],
        censor: '[REDACTED]',
      },
    },
  });

  registerErrorHandling(app);
  registerPrisma(app, env);
  registerAuthentication(app, env);
  void app.register(healthRoutes);
  void app.register(authRoutes, { prefix: '/api/v1/auth' });

  return app;
}
