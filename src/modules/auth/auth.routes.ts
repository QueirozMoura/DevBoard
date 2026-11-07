import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../plugins/errors.js';
import { createDummyPasswordHash } from './auth.password.js';
import { loginSchema, profilePatchSchema, registerSchema, sessionSchema } from './auth.schema.js';
import { createSession, useSession } from './auth.session.js';
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

const tokenPairSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accessToken', 'refreshToken'],
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
  },
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const dummyPasswordHash = await createDummyPasswordHash();
  app.get('/api/v1/me', { onRequest: app.authenticate }, async (request) => {
    const authenticatedUser = request.user;
    if (!authenticatedUser) throw new AppError('UNAUTHORIZED');
    const user = await app.prisma.user.findUnique({
      where: { id: authenticatedUser.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!user) throw new AppError('USER_NOT_FOUND');
    return user;
  });
  app.patch('/api/v1/me', { onRequest: app.authenticate }, async (request) => {
    const authenticatedUser = request.user;
    if (!authenticatedUser) throw new AppError('UNAUTHORIZED');
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR');
    const data = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
    };
    try {
      return await app.prisma.user.update({
        where: { id: authenticatedUser.id }, data,
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002')
        throw new AppError('EMAIL_ALREADY_EXISTS');
      if (error instanceof Error && 'code' in error && error.code === 'P2025')
        throw new AppError('USER_NOT_FOUND');
      throw error;
    }
  });
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
          required: ['accessToken', 'refreshToken', 'user'],
          properties: {
            ...tokenPairSchema.properties,
            user: publicUserSchema,
          },
        },
      },
    },
    handler: async (request, reply) => {
      const result = loginSchema.safeParse(request.body);
      if (!result.success) throw new AppError('LOGIN_VALIDATION_ERROR');
      const user = await loginUser(app.prisma, result.data, dummyPasswordHash);
      const accessToken = await app.accessTokens.sign(user.id);
      const refreshToken = await createSession(app.prisma, user.id);
      return reply.send({ accessToken, refreshToken, user });
    },
  });
  app.post('/refresh', {
    schema: { response: { 200: tokenPairSchema } },
    handler: async (request, reply) => {
      const parsed = sessionSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError('INVALID_REFRESH_TOKEN');
      const result = await useSession(app.prisma, parsed.data.refreshToken, (userId) =>
        app.accessTokens.sign(userId),
      );
      return reply.send(result);
    },
  });
  app.post('/logout', {
    handler: async (request, reply) => {
      const parsed = sessionSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError('INVALID_REFRESH_TOKEN');
      await useSession(
        app.prisma,
        parsed.data.refreshToken,
        (userId) => app.accessTokens.sign(userId),
        true,
      );
      return reply.status(204).send();
    },
  });
};
