import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../plugins/errors.js';
import { registerSchema } from './auth.schema.js';
import { registerUser } from './auth.service.js';

export const authRoutes: FastifyPluginAsync = (app) => {
  app.post('/register', {
    schema: {
      response: {
        201: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'email', 'createdAt'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const result = registerSchema.safeParse(request.body);
      if (!result.success) throw new AppError('VALIDATION_ERROR');

      const user = await registerUser(app.prisma, result.data);
      return reply.status(201).send(user);
    },
  });
  return Promise.resolve();
};
