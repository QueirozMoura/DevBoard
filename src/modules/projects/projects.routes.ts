import { userId as actorIdOf } from '../shared/core.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../plugins/errors.js';
import {
  defined,
  ascending,
  descending,
  id,
  lockProject,
  membership,
  nonempty,
  pageQuery,
  paginate,
  parse,
  role,
  type Tx,
} from '../shared/core.js';

const fields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
};
const create = z.strictObject(fields);
const update = z
  .strictObject({ name: fields.name.optional(), description: fields.description })
  .refine(nonempty);
const memberInclude = { user: { select: { name: true, email: true } } } as const;
async function projectView(tx: Tx, projectId: string, userId: string) {
  const member = await membership(tx, projectId, userId);
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { _count: { select: { members: true, tasks: true } } },
  });
  const { _count, ...result } = project;
  return {
    ...result,
    myRole: member.role,
    memberCount: _count.members,
    taskCount: _count.tasks,
  };
}
export const projectsRoutes: FastifyPluginAsync = (app) => {
  app.addHook('onRequest', app.authenticate);
  app.get('/projects', async (request) => {
    const actorId = actorIdOf(request);
    const query = parse(pageQuery.strict(), request.query);
    return app.prisma.$transaction(async (tx) => {
      const rows = await tx.project.findMany({
        where: { members: { some: { userId: actorId } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const page = paginate(rows, query, ['projects', actorId], app.env.JWT_SECRET, (p) =>
        descending(p.createdAt, p.id),
      );
      return {
        ...page,
        items: await Promise.all(page.items.map((p) => projectView(tx, p.id, actorId))),
      };
    });
  });
  app.post('/projects', async (request, reply) => {
    const data = parse(create, request.body);
    const result = await app.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          ...defined(data),
          members: { create: { userId: actorIdOf(request), role: 'OWNER' } },
        },
      });
      return projectView(tx, project.id, actorIdOf(request));
    });
    return reply.status(201).send(result);
  });
  app.get('/projects/:projectId', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    return app.prisma.$transaction((tx) =>
      projectView(tx, projectId, actorIdOf(request)),
    );
  });
  app.patch('/projects/:projectId', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    return app.prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      await membership(tx, projectId, actorIdOf(request), true);
      const data = parse(update, request.body);
      await tx.project.update({ where: { id: projectId }, data: defined(data) });
      return projectView(tx, projectId, actorIdOf(request));
    });
  });
  app.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    await app.prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      await membership(tx, projectId, actorIdOf(request), true);
      await tx.project.delete({ where: { id: projectId } });
    });
    return reply.status(204).send();
  });
  app.get('/projects/:projectId/members', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const query = parse(pageQuery.strict(), request.query);
    return app.prisma.$transaction(async (tx) => {
      await membership(tx, projectId, actorIdOf(request));
      const rows = await tx.projectMember.findMany({
        where: { projectId },
        include: memberInclude,
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      });
      const page = paginate(
        rows,
        query,
        ['members', projectId, actorIdOf(request)],
        app.env.JWT_SECRET,
        (m) => ascending(m.joinedAt, m.userId),
      );
      return {
        ...page,
        items: page.items.map(({ user, userId, role, joinedAt }) => ({
          ...user,
          userId,
          role,
          joinedAt,
        })),
      };
    });
  });
  app.post('/projects/:projectId/members', async (request, reply) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const result = await app.prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      await membership(tx, projectId, actorIdOf(request), true);
      const data = parse(
        z.strictObject({
          email: z.email().trim().toLowerCase().max(254),
          role: role.default('MEMBER'),
        }),
        request.body,
      );
      const user = await tx.user.findUnique({ where: { email: data.email } });
      if (!user) throw new AppError('INVITEE_NOT_FOUND');
      if (
        await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
        })
      )
        throw new AppError('ALREADY_MEMBER');
      const member = await tx.projectMember.create({
        data: { projectId, userId: user.id, role: data.role },
      });
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: member.role,
        joinedAt: member.joinedAt,
      };
    });
    return reply.status(201).send(result);
  });
  for (const method of ['PATCH', 'DELETE'] as const) {
    app.route({
      method,
      url: '/projects/:projectId/members/:userId',
      handler: async (request, reply) => {
        const { projectId, userId } = parse(
          z.object({ projectId: id, userId: id }),
          request.params,
        );
        const result = await app.prisma.$transaction(async (tx) => {
          await lockProject(tx, projectId);
          const actor = await membership(tx, projectId, actorIdOf(request));
          if (actor.role !== 'OWNER' && (method === 'PATCH' || userId !== actor.userId))
            throw new AppError('FORBIDDEN');
          const target = await membership(tx, projectId, userId);
          const data =
            method === 'PATCH' ? parse(z.strictObject({ role }), request.body) : null;
          if (
            target.role === 'OWNER' &&
            data?.role !== 'OWNER' &&
            (await tx.projectMember.count({ where: { projectId, role: 'OWNER' } })) === 1
          )
            throw new AppError('LAST_OWNER');
          if (!data) {
            await tx.task.updateMany({
              where: { projectId, assigneeId: userId },
              data: { assigneeId: null },
            });
            await tx.projectMember.delete({
              where: { projectId_userId: { projectId, userId } },
            });
            return null;
          }
          const { user, ...member } = await tx.projectMember.update({
            where: { projectId_userId: { projectId, userId } },
            data,
            include: memberInclude,
          });
          return { userId, ...user, role: member.role, joinedAt: member.joinedAt };
        });
        return result ?? reply.status(204).send();
      },
    });
  }
  return Promise.resolve();
};
