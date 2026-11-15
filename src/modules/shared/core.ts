import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';

export type Tx = Prisma.TransactionClient;
export const id = z.uuid().transform((value) => value.toLowerCase());
export const role = z.enum(['OWNER', 'MEMBER']);
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'VALIDATION_ERROR',
      'Dados inválidos',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
export const nonempty = (value: object) => Object.keys(value).length > 0;
export async function lockProject(tx: Tx, projectId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${projectId}, 1))`;
}
export async function membership(
  tx: Tx,
  projectId: string,
  userId: string,
  owner = false,
) {
  // Readers hold a shared project lock until commit; removals/deletes use the exclusive lock.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(hashtextextended(${projectId}, 1))`;
  const member = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new AppError('NOT_FOUND');
  if (owner && member.role !== 'OWNER') throw new AppError('FORBIDDEN');
  return member;
}
// Signed cursors bind the ordering tuple to the authenticated user and exact query.
export const datedKey = z.strictObject({ date: z.iso.datetime(), id: z.uuid() });
export const taskKey = z.strictObject({
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  position: z.string().regex(/^\d{30}$/),
  id: z.uuid(),
});
export function pagination<K>(
  query: { limit: number; cursor?: string | undefined },
  scope: unknown,
  secret: string,
  schema: z.ZodType<K>,
) {
  const binding = JSON.stringify(scope);
  const sign = (payload: string) =>
    createHmac('sha256', secret).update(binding).update(payload).digest('base64url');
  let after: K | undefined;
  if (query.cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(query.cursor))
      throw new AppError('INVALID_CURSOR');
    const [payload, signature] = query.cursor.split('.');
    if (
      !payload ||
      !signature ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))
    )
      throw new AppError('INVALID_CURSOR');
    try {
      const parsed = schema.safeParse(
        JSON.parse(Buffer.from(payload, 'base64url').toString()),
      );
      if (!parsed.success) throw new Error();
      after = parsed.data;
    } catch {
      throw new AppError('INVALID_CURSOR');
    }
  }
  return {
    after,
    take: query.limit + 1,
    result<T>(rows: T[], key: (row: T) => K) {
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      const payload = last
        ? Buffer.from(JSON.stringify(key(last))).toString('base64url')
        : '';
      return {
        items,
        nextCursor: rows.length > query.limit ? `${payload}.${sign(payload)}` : null,
      };
    },
  };
}
export function datedAfter(
  after: z.infer<typeof datedKey> | undefined,
  field: 'createdAt' | 'joinedAt',
  idField: 'id' | 'userId',
  direction: 'asc' | 'desc',
) {
  if (!after) return {};
  const op = direction === 'asc' ? 'gt' : 'lt';
  const date = new Date(after.date);
  return {
    OR: [{ [field]: { [op]: date } }, { [field]: date, [idField]: { [op]: after.id } }],
  };
}
/** Strip absent Zod optionals before passing data to Prisma (exactOptionalPropertyTypes). */
export function defined<T extends object>(
  data: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export function userId(request: { user: { id: string } | null }): string {
  if (!request.user) throw new AppError('UNAUTHORIZED');
  return request.user.id;
}
export function at<T>(rows: T[], index: number): T {
  const row = rows[index];
  if (row === undefined) throw new Error('Index out of range');
  return row;
}
