import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/health', () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  app.get('/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
  return Promise.resolve();
};
