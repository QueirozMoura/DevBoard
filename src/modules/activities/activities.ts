import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ActivityType, Prisma } from '../../generated/prisma/client.js';
import {
  datedKey,
  datedAfter,
  id,
  membership,
  pageQuery,
  pagination,
  parse,
  userId,
  type Tx,
} from '../shared/core.js';

export function record(
  tx: Tx,
  projectId: string,
  actorId: string,
  type: ActivityType,
  data: Prisma.InputJsonObject = {},
  taskId: string | null = null,
) {
  return tx.activity.create({ data: { projectId, actorId, type, data, taskId } });
}
export function changes(before: object, after: object): string[] {
  const original = new Map(Object.entries(before));
  return Object.entries(after)
    .filter(([key, value]) => JSON.stringify(original.get(key)) !== JSON.stringify(value))
    .map(([key]) => key);
}
const types = z.enum([
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_DELETED',
  'COMMENT_ADDED',
]);
export const activitiesRoutes: FastifyPluginAsync = (app) => {
  app.addHook('onRequest', app.authenticate);
  app.get('/projects/:projectId/activities', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const { limit, cursor, ...filter } = parse(
      pageQuery.extend({ taskId: id.optional(), type: types.optional() }).strict(),
      request.query,
    );
    return app.prisma.$transaction(async (tx) => {
      await membership(tx, projectId, userId(request));
      const pager = pagination(
        { limit, cursor },
        ['activities', projectId, userId(request), filter],
        app.env.JWT_SECRET,
        datedKey,
      );

      const rows = await tx.activity.findMany({
        where: {
          projectId,
          ...datedAfter(pager.after, 'createdAt', 'id', 'desc'),
          ...(filter.taskId ? { taskId: filter.taskId } : {}),
          ...(filter.type ? { type: filter.type } : {}),
        },
        take: pager.take,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const page = pager.result(rows, (a) => ({
        date: a.createdAt.toISOString(),
        id: a.id,
      }));
      return {
        ...page,
        items: page.items.map((a) => ({
          id: a.id,
          projectId: a.projectId,
          taskId: a.taskId,
          actor: a.actor,
          type: a.type,
          data: a.data,
          createdAt: a.createdAt,
        })),
      };
    });
  });
  return Promise.resolve();
};
