import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';
import { profilePatchSchema } from './users.schema.js';

const publicUserSelect = { id: true, name: true, email: true, createdAt: true } as const;

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

/** Registrado com prefixo `/api/v1`: expõe `GET/PATCH /api/v1/me`. */
export const usersRoutes: FastifyPluginAsync = (app) => {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  function authenticatedUserId(request: { user: { id: string } | null }): string {
    if (!request.user) throw new AppError('UNAUTHORIZED');
    return request.user.id;
  }

  app.get('/me', {
    onRequest: app.authenticate,
    schema: { response: { 200: publicUserSchema } },
    handler: async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: authenticatedUserId(request) },
        select: publicUserSelect,
      });
      if (!user) throw new AppError('USER_NOT_FOUND');
      return user;
    },
  });

  app.patch('/me', {
    onRequest: app.authenticate,
    schema: { response: { 200: publicUserSchema } },
    handler: async (request) => {
      const id = authenticatedUserId(request);
      const parsed = profilePatchSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Dados inválidos');
      const data = {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      };
      try {
        return await app.prisma.user.update({
          where: { id },
          data,
          select: publicUserSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') throw new AppError('EMAIL_ALREADY_EXISTS');
          if (error.code === 'P2025') throw new AppError('USER_NOT_FOUND');
        }
        throw error;
      }
    },
  });

  return Promise.resolve();
};
