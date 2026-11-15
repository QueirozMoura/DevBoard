import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../plugins/errors.js';
import {
  defined,
  id,
  lockProject,
  membership,
  nonempty,
  pageQuery,
  paginate,
  parse,
  type Tx,
} from '../shared/core.js';

export const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
const status = z.enum(statuses);
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).nullable().optional(),
  priority: priority.optional(),
  assigneeId: id.nullable().optional(),
  dueDate: z.iso
    .datetime()
    .transform((v) => new Date(v))
    .nullable()
    .optional(),
};
const create = z.strictObject({ ...fields, status: status.default('TODO') });
const patch = z
  .strictObject({ ...fields, title: fields.title.optional() })
  .refine(nonempty);
const filters = {
  status: status.optional(),
  priority: priority.optional(),
  assigneeId: id.optional(),
  unassigned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().trim().max(100).optional(),
};
const querySchema = pageQuery
  .extend(filters)
  .strict()
  .refine((v) => !(v.unassigned && v.assigneeId));
const taskInclude = {} as const;
export async function taskAccess(tx: Tx, taskId: string, userId: string, lock = false) {
  const candidate = await tx.task.findUnique({ where: { id: taskId } });
  if (!candidate) throw new AppError('NOT_FOUND');
  if (lock) await lockProject(tx, candidate.projectId);
  const member = await membership(tx, candidate.projectId, userId);
  const task = await tx.task.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task) throw new AppError('NOT_FOUND');
  return { task, member };
}
export function taskView<T extends object>(task: T) {
  return { ...task, commentCount: 0 };
}
async function assignee(tx: Tx, projectId: string, assigneeId?: string | null) {
  if (
    assigneeId &&
    !(await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
    }))
  )
    throw new AppError('INVALID_ASSIGNEE');
}
const MAX = 10n ** 30n - 1n;
const rank = (n: bigint) => n.toString().padStart(30, '0');
/** Caller holds the project lock. Rebalance only when there is no integer gap left. */
async function position(
  tx: Tx,
  projectId: string,
  column: (typeof statuses)[number],
  afterTaskId: string | null | undefined,
  excluded?: string,
): Promise<string> {
  const rows = await tx.task.findMany({
    where: { projectId, status: column, ...(excluded ? { id: { not: excluded } } : {}) },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  const index =
    afterTaskId === undefined
      ? rows.length
      : afterTaskId === null
        ? 0
        : rows.findIndex((t) => t.id === afterTaskId) + 1;
  if (afterTaskId && index === 0) throw new AppError('INVALID_MOVE_TARGET');
  const lower = index === 0 ? 0n : BigInt(rows[index - 1]!.position);
  const upper = index === rows.length ? MAX : BigInt(rows[index]!.position);
  if (upper - lower > 1n) return rank((lower + upper) / 2n);
  const gap = MAX / BigInt(rows.length + 2);
  for (let i = 0; i < rows.length; i++)
    await tx.task.update({
      where: { id: rows[i]!.id },
      data: { position: rank(gap * BigInt(i + 1)) },
    });
  return rank(
    index === 0
      ? gap / 2n
      : index === rows.length
        ? gap * BigInt(index + 1)
        : gap * BigInt(index) + gap / 2n,
  );
}
export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const key = (t: { status: string; position: string; id: string }) =>
    `${statuses.indexOf(t.status as (typeof statuses)[number])}:${t.position}:${t.id}`;
  app.get('/projects/:projectId/tasks', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const query = parse(querySchema, request.query);
    return app.prisma.$transaction(async (tx) => {
      await membership(tx, projectId, request.user!.id);
      const { limit, cursor, ...filter } = query;
      const rows = await tx.task.findMany({
        where: {
          projectId,
          ...defined({
            status: filter.status,
            priority: filter.priority,
            assigneeId: filter.unassigned ? null : filter.assigneeId,
          }),
          ...(filter.q
            ? { title: { contains: filter.q, mode: 'insensitive' as const } }
            : {}),
        },
        include: taskInclude,
        orderBy: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      });
      const page = paginate(
        rows,
        { limit, cursor },
        ['tasks', projectId, request.user!.id, filter],
        app.env.JWT_SECRET,
        key,
      );
      return { ...page, items: page.items.map(taskView) };
    });
  });
  app.get('/projects/:projectId/board', async (request) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const { limitPerColumn } = parse(
      z.strictObject({
        limitPerColumn: z.coerce.number().int().min(1).max(200).default(50),
      }),
      request.query,
    );
    return app.prisma.$transaction(
      async (tx) => {
        await membership(tx, projectId, request.user!.id);
        const columns = [];
        for (const column of statuses) {
          const rows = await tx.task.findMany({
            where: { projectId, status: column },
            include: taskInclude,
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          });
          const page = paginate(
            rows,
            { limit: limitPerColumn },
            ['tasks', projectId, request.user!.id, { status: column }],
            app.env.JWT_SECRET,
            key,
          );
          columns.push({
            status: column,
            tasks: page.items.map(taskView),
            total: rows.length,
            hasMore: page.nextCursor !== null,
            nextCursor: page.nextCursor,
          });
        }
        return { columns };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  });
  app.post('/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = parse(z.object({ projectId: id }), request.params);
    const result = await app.prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      await membership(tx, projectId, request.user!.id);
      const data = parse(create, request.body);
      await assignee(tx, projectId, data.assigneeId);
      return taskView(
        await tx.task.create({
          data: {
            ...defined(data),
            projectId,
            createdById: request.user!.id,
            position: await position(tx, projectId, data.status, undefined),
          },
          include: taskInclude,
        }),
      );
    });
    return reply.status(201).send(result);
  });
  app.get('/tasks/:taskId', async (request) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    return app.prisma.$transaction(async (tx) =>
      taskView((await taskAccess(tx, taskId, request.user!.id)).task),
    );
  });
  app.patch('/tasks/:taskId', async (request) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    return app.prisma.$transaction(async (tx) => {
      const { task } = await taskAccess(tx, taskId, request.user!.id, true);
      const data = parse(patch, request.body);
      await assignee(tx, task.projectId, data.assigneeId);
      return taskView(
        await tx.task.update({
          where: { id: taskId },
          data: defined(data),
          include: taskInclude,
        }),
      );
    });
  });
  app.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    await app.prisma.$transaction(async (tx) => {
      const { task, member } = await taskAccess(tx, taskId, request.user!.id, true);
      if (member.role !== 'OWNER' && task.createdById !== request.user!.id)
        throw new AppError('FORBIDDEN');
      await tx.task.delete({ where: { id: taskId } });
    });
    return reply.status(204).send();
  });
  app.post('/tasks/:taskId/move', async (request) => {
    const { taskId } = parse(z.object({ taskId: id }), request.params);
    return app.prisma.$transaction(async (tx) => {
      const { task } = await taskAccess(tx, taskId, request.user!.id, true);
      const data = parse(
        z.strictObject({ status: status.optional(), afterTaskId: id.nullable() }),
        request.body,
      );
      if (data.afterTaskId === taskId) throw new AppError('INVALID_MOVE_TARGET');
      const nextStatus = data.status ?? task.status;
      const nextPosition = await position(
        tx,
        task.projectId,
        nextStatus,
        data.afterTaskId,
        taskId,
      );
      return taskView(
        await tx.task.update({
          where: { id: taskId },
          data: { status: nextStatus, position: nextPosition },
          include: taskInclude,
        }),
      );
    });
  });
};
