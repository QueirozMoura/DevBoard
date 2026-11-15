import { record } from '../activities/activities.js';
import { userId } from '../shared/core.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../plugins/errors.js';
import {
  datedKey,
  datedAfter,
  id,
  pageQuery,
  pagination,
  parse,
} from '../shared/core.js';
import { taskAccess } from '../tasks/tasks.routes.js';

const body = z.strictObject({ body: z.string().trim().min(1).max(5000) });
const include = { author: { select: { id: true, name: true } } } as const;
function view(comment: {
  id: string;
  taskId: string;
  body: string;
  author: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const { id, taskId, body, author, createdAt, updatedAt } = comment;
  return { id, taskId, body, author, createdAt, updatedAt };
}
export const commentsRoutes: FastifyPluginAsync = (app) => {
  app.addHook('onRequest', app.authenticate);
  app.get('/tasks/:taskId/comments', async (request) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    const query = parse(pageQuery.strict(), request.query);
    return app.prisma.$transaction(async (tx) => {
      await taskAccess(tx, taskId, userId(request));
      const pager = pagination(
        query,
        ['comments', taskId, userId(request)],
        app.env.JWT_SECRET,
        datedKey,
      );

      const rows = await tx.comment.findMany({
        where: { taskId, ...datedAfter(pager.after, 'createdAt', 'id', 'asc') },
        take: pager.take,
        include,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const page = pager.result(rows, (c) => ({
        date: c.createdAt.toISOString(),
        id: c.id,
      }));
      return { ...page, items: page.items.map(view) };
    });
  });
  app.post('/tasks/:taskId/comments', async (request, reply) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    const result = await app.prisma.$transaction(async (tx) => {
      const { task } = await taskAccess(tx, taskId, userId(request), true);
      const data = parse(body, request.body);
      const result = await tx.comment.create({
        data: { ...data, taskId, authorId: userId(request) },
        include,
      });
      await record(
        tx,
        task.projectId,
        userId(request),
        'COMMENT_ADDED',
        { title: task.title, commentId: result.id },
        task.id,
      );
      return view(result);
    });
    return reply.status(201).send(result);
  });
  for (const method of ['PATCH', 'DELETE'] as const)
    app.route({
      method,
      url: '/comments/:commentId',
      handler: async (request, reply) => {
        const { commentId } = parse(z.object({ commentId: id }), request.params);
        const result = await app.prisma.$transaction(async (tx) => {
          const candidate = await tx.comment.findUnique({ where: { id: commentId } });
          if (!candidate) throw new AppError('NOT_FOUND');
          const { member } = await taskAccess(
            tx,
            candidate.taskId,
            userId(request),
            true,
          );
          const comment = await tx.comment.findUnique({ where: { id: commentId } });
          if (!comment) throw new AppError('NOT_FOUND');
          if (
            comment.authorId !== userId(request) &&
            (method === 'PATCH' || member.role !== 'OWNER')
          )
            throw new AppError('FORBIDDEN');
          if (method === 'DELETE') {
            await tx.comment.delete({ where: { id: commentId } });
            return null;
          }
          return view(
            await tx.comment.update({
              where: { id: commentId },
              data: parse(body, request.body),
              include,
            }),
          );
        });
        return result ?? reply.status(204).send();
      },
    });
  return Promise.resolve();
};
