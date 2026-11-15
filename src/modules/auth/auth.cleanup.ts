import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** Absolute expiry is shared by every token in a family; preserve all active-family ancestors. */
export function cleanupSessions(prisma: PrismaClient) {
  return prisma.$executeRaw`DELETE FROM refresh_tokens WHERE id IN
   (SELECT id FROM refresh_tokens WHERE expires_at <= now() ORDER BY expires_at LIMIT 1000)`;
}
export function scheduleSessionCleanup(app: FastifyInstance) {
  const timer = setInterval(
    () => {
      void cleanupSessions(app.prisma).catch(() => {
        app.log.error({ code: 'SESSION_CLEANUP_FAILED' }, 'falha ao limpar sessões');
      });
    },
    60 * 60 * 1000,
  );
  timer.unref();
  app.addHook('onClose', () => {
    clearInterval(timer);
    return Promise.resolve();
  });
}
