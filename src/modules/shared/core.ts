import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';

export type Tx = Prisma.TransactionClient;
export const id = z.uuid();
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
  const member = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new AppError('NOT_FOUND');
  if (owner && member.role !== 'OWNER') throw new AppError('FORBIDDEN');
  return member;
}
// HMAC binds cursors to user, resource, filters and ordering. Limits may change between pages.
export function paginate<T>(
  rows: T[],
  query: { limit: number; cursor?: string | undefined },
  scope: unknown,
  secret: string,
  key: (row: T) => string,
) {
  const binding = JSON.stringify(scope);
  const sign = (payload: string) =>
    createHmac('sha256', secret).update(binding).update(payload).digest('base64url');
  let start = 0;
  if (query.cursor) {
    const [payload, signature, extra] = query.cursor.split('.');
    const expected = payload ? sign(payload) : '';
    if (
      !payload ||
      !signature ||
      extra ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new AppError('INVALID_CURSOR');
    const last = Buffer.from(payload, 'base64url').toString();
    // Compare immutable ordering tuples; continue even if the anchor was deleted.
    start = rows.findIndex((row) => key(row) > last);
    if (start === -1) start = rows.length;
  }
  const items = rows.slice(start, start + query.limit);
  const last = items.at(-1);
  const payload = last ? Buffer.from(key(last)).toString('base64url') : '';
  return {
    items,
    nextCursor: start + items.length < rows.length ? `${payload}.${sign(payload)}` : null,
  };
}
export const ascending = (date: Date, id: string) => `${date.toISOString()}:${id}`;
export const descending = (date: Date, id: string) =>
  `${String(9999999999999 - date.getTime()).padStart(13, '0')}:${id
    .split('')
    .map((c) => (c === '-' ? '-' : (15 - parseInt(c, 16)).toString(16)))
    .join('')}`;

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
