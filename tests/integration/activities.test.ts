import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
import type { Result } from '../helpers/api.js';
interface Activity {
  id: string;
  taskId: string | null;
  actor: { id: string; name: string } | null;
  type: string;
  data: Record<string, unknown>;
}
interface Page {
  items: Activity[];
  nextCursor: string | null;
}
const app = buildApp(loadEnv());
beforeAll(() => app.ready());
afterAll(() => app.close());
let token: string, projectId: string;
const req = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${path}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
beforeEach(async () => {
  await resetDatabase(app.prisma);
  const user = await app.prisma.user.create({
    data: { name: 'owner', email: 'owner@test.com', passwordHash: 'unused' },
  });
  token = await app.accessTokens.sign(user.id);
  projectId = (await req('POST', '/projects', { name: 'project' })).json<Result>().id;
});
it('histórico correto, sem texto sensível e com vínculos após exclusão', async () => {
  await req('PATCH', `/projects/${projectId}`, { description: 'private description' });
  const task = (
    await req('POST', `/projects/${projectId}/tasks`, {
      title: 'task',
      description: 'private task',
    })
  ).json<Result>();
  await req('PATCH', `/tasks/${task.id}`, { priority: 'HIGH' });
  await req('POST', `/tasks/${task.id}/move`, { afterTaskId: null });
  expect(await app.prisma.activity.count({ where: { type: 'TASK_MOVED' } })).toBe(0);
  await req('POST', `/tasks/${task.id}/move`, { status: 'DONE', afterTaskId: null });
  await req('POST', `/tasks/${task.id}/comments`, { body: 'private comment' });
  const history = (await req('GET', `/projects/${projectId}/activities`)).json<Page>();
  expect(history.items.map((a) => a.type)).toEqual([
    'COMMENT_ADDED',
    'TASK_MOVED',
    'TASK_UPDATED',
    'TASK_CREATED',
    'PROJECT_UPDATED',
    'PROJECT_CREATED',
  ]);
  expect(JSON.stringify(history)).not.toContain('private');
  const filtered = (
    await req(
      'GET',
      `/projects/${projectId}/activities?type=TASK_MOVED&taskId=${task.id}`,
    )
  ).json<Page>();
  expect(filtered.items).toHaveLength(1);
  expect(filtered.items[0]?.data).toEqual({ title: 'task', from: 'TODO', to: 'DONE' });
  const page = (
    await req('GET', `/projects/${projectId}/activities?limit=1`)
  ).json<Page>();
  expect(
    (
      await req('GET', `/projects/${projectId}/activities?cursor=${page.nextCursor}`)
    ).json<Page>().items,
  ).toHaveLength(5);
  await req('DELETE', `/tasks/${task.id}`);
  const after = (await req('GET', `/projects/${projectId}/activities`)).json<Page>();
  expect(after.items.every((a) => a.taskId === null)).toBe(true);
  expect(after.items[0]?.type).toBe('TASK_DELETED');
});
it('falha no histórico reverte a mutação principal', async () => {
  // Fixed SQL, exclusively in the database guarded by resetDatabase (_test).
  await app.prisma.$executeRawUnsafe(
    `CREATE FUNCTION fail_activity_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'activity failure'; END $$`,
  );
  await app.prisma.$executeRawUnsafe(
    `CREATE TRIGGER fail_activity_test BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION fail_activity_test()`,
  );
  try {
    expect(
      (await req('PATCH', `/projects/${projectId}`, { name: 'must rollback' }))
        .statusCode,
    ).toBe(500);
    expect(
      (await req('POST', `/projects/${projectId}/tasks`, { title: 'must rollback' }))
        .statusCode,
    ).toBe(500);
    expect(await app.prisma.task.count()).toBe(0);
    expect(
      (await app.prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name,
    ).toBe('project');
    expect(await app.prisma.activity.count()).toBe(1);
  } finally {
    await app.prisma.$executeRawUnsafe('DROP TRIGGER fail_activity_test ON activities');
    await app.prisma.$executeRawUnsafe('DROP FUNCTION fail_activity_test()');
  }
});
it('membros: eventos de adição, alteração e remoção; falhas não geram eventos', async () => {
  const member = await app.prisma.user.create({
    data: { name: 'member', email: 'member@test.com', passwordHash: 'unused' },
  });
  await req('POST', `/projects/${projectId}/members`, { email: member.email });
  await req('POST', `/projects/${projectId}/members`, { email: member.email });
  await req('PATCH', `/projects/${projectId}/members/${member.id}`, { role: 'OWNER' });
  await req('DELETE', `/projects/${projectId}/members/${member.id}`);
  const page = (await req('GET', `/projects/${projectId}/activities`)).json<Page>();
  expect(page.items.map((a) => a.type)).toEqual([
    'MEMBER_REMOVED',
    'MEMBER_ROLE_CHANGED',
    'MEMBER_ADDED',
    'PROJECT_CREATED',
  ]);
  const outside = await app.accessTokens.sign(member.id);
  expect(
    (
      await app.inject({
        url: `/api/v1/projects/${projectId}/activities`,
        headers: { authorization: `Bearer ${outside}` },
      })
    ).statusCode,
  ).toBe(404);
});
