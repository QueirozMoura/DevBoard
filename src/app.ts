import { registerHardening } from './plugins/hardening.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';
import { commentsRoutes } from './modules/comments/comments.routes.js';
import { activitiesRoutes } from './modules/activities/activities.js';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { registerAuthentication } from './plugins/authentication.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerPrisma } from './plugins/prisma.js';
import { usersRoutes } from './modules/users/users.routes.js';

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

  app.decorate('env', env);
  void app.register(cookie);
  void app.register(cors, {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  registerHardening(app);
  registerErrorHandling(app);
  registerPrisma(app, env);
  registerAuthentication(app, env);
  void app.register(healthRoutes);
  void app.register(authRoutes, { prefix: '/api/v1/auth' });
  void app.register(activitiesRoutes, { prefix: '/api/v1' });
  void app.register(commentsRoutes, { prefix: '/api/v1' });
  void app.register(tasksRoutes, { prefix: '/api/v1' });
  void app.register(projectsRoutes, { prefix: '/api/v1' });
  void app.register(usersRoutes, { prefix: '/api/v1' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}
