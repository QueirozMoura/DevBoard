import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../plugins/errors.js';
import { createDummyPasswordHash } from './auth.password.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { loginUser, registerUser } from './auth.service.js';

const publicUserSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'email', 'createdAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  const dummyPasswordHash = await createDummyPasswordHash();
  app.post('/register', {
    schema: {
      response: {
        201: publicUserSchema,
      },
    },
    handler: async (request, reply) => {
      const result = registerSchema.safeParse(request.body);
      if (!result.success) throw new AppError('VALIDATION_ERROR');

      const user = await registerUser(app.prisma, result.data);
      return reply.status(201).send(user);
    },
  });
  app.post('/login', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['accessToken', 'user'],
          properties: {
            accessToken: { type: 'string' },
            user: publicUserSchema,
          },
        },
      },
    },
    handler: async (request, reply) => {
      // Aplica-se a sucesso e a falhas, evitando cache de respostas de autenticação.
      reply.header('Cache-Control', 'no-store');
      const result = loginSchema.safeParse(request.body);
      if (!result.success) throw new AppError('LOGIN_VALIDATION_ERROR');
      const user = await loginUser(app.prisma, result.data, dummyPasswordHash);
      const accessToken = await app.accessTokens.sign(user.id);
      return reply.send({ accessToken, user });
    },
  });
};
