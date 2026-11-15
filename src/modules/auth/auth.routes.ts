import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../plugins/errors.js';
import { createDummyPasswordHash } from './auth.password.js';
import { loginSchema, registerSchema, sessionSchema } from './auth.schema.js';
import { REFRESH_TOKEN_TTL_MS, createSession, useSession } from './auth.session.js';
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
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    secure: app.env.NODE_ENV === 'production',
  };
  function setCookie(reply: FastifyReply, token: string, expiresAt: Date) {
    reply.setCookie('refresh_token', token, {
      ...cookieOptions,
      maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    });
  }
  function readToken(request: FastifyRequest, reply: FastifyReply) {
    const cookieToken = request.cookies.refresh_token;
    if (cookieToken !== undefined) {
      if (
        !request.headers.origin ||
        !app.env.CORS_ORIGIN.split(',').includes(request.headers.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        throw new AppError('CSRF_ORIGIN_REJECTED');
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
        throw new AppError('CSRF_ORIGIN_REJECTED');
      }
    }
    const parsed = sessionSchema.safeParse(
      cookieToken !== undefined ? { refreshToken: cookieToken } : request.body,
    );
    if (!parsed.success) {
      reply.clearCookie('refresh_token', cookieOptions);
      throw new AppError('INVALID_REFRESH_TOKEN');
    }
    return parsed.data.refreshToken;
  }
  async function session(request: FastifyRequest, reply: FastifyReply, logout = false) {
    const token = readToken(request, reply);
    try {
      return await useSession(
        app.prisma,
        token,
        (id) => app.accessTokens.sign(id),
        logout,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_REFRESH_TOKEN')
        reply.clearCookie('refresh_token', cookieOptions);
      throw error;
    }
  }
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
      setCookie(reply, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
      return reply.send({ accessToken, refreshToken, user });
    },
  });
  app.post('/refresh', {
    schema: { response: { 200: tokenPairSchema } },
    handler: async (request, reply) => {
      const result = await session(request, reply);
      if ('loggedOut' in result) throw new AppError('INVALID_REFRESH_TOKEN');
      if (result.refreshToken) setCookie(reply, result.refreshToken, result.expiresAt);
      return reply.send(result);
    },
  });
  app.post('/logout', {
    handler: async (request, reply) => {
      await session(request, reply, true);
      reply.clearCookie('refresh_token', cookieOptions);
      return reply.status(204).send();
    },
  });
};
