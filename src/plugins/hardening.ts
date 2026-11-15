import { createHash } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { AppError } from './errors.js';

export function registerHardening(app: FastifyInstance) {
  void app.register(helmet);
  void app.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    max: app.env.RATE_LIMIT_USER_MAX,
    timeWindow: 60000,
    allowList: (request) =>
      request.url.startsWith('/api/v1/auth/') || !request.url.startsWith('/api/v1/'),
    keyGenerator: (request) => request.user?.id ?? request.ip,
    errorResponseBuilder: () => new AppError('RATE_LIMITED'),
  });
}
export function emailRateKey(body: unknown) {
  const email =
    typeof body === 'object' &&
    body !== null &&
    'email' in body &&
    typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';
  return createHash('sha256').update(email).digest('hex');
}
