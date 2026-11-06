import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = (app) => {
  app.get('/health', () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  return Promise.resolve();
};
