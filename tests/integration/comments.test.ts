import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
import { at, type Result, type Page } from '../helpers/api.js';
const app = buildApp(loadEnv());
beforeAll(() => app.ready());
afterAll(() => app.close());
let owner: string, member: string, outsider: string, projectId: string, taskId: string;
const req = (
  token: string,
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
  const users = await Promise.all(
    ['owner', 'member', 'outsider'].map((name) =>
      app.prisma.user.create({
        data: { name, email: `${name}@test.com`, passwordHash: 'unused' },
      }),
    ),
  );
  const tokens = await Promise.all(users.map((u) => app.accessTokens.sign(u.id)));
  owner = at(tokens, 0);
  member = at(tokens, 1);
  outsider = at(tokens, 2);
  projectId = (await req(owner, 'POST', '/projects', { name: 'project' })).json<Result>()
    .id;
  await req(owner, 'POST', `/projects/${projectId}/members`, {
    email: 'member@test.com',
  });
  taskId = (
    await req(owner, 'POST', `/projects/${projectId}/tasks`, { title: 'task' })
  ).json<Result>().id;
});
it('somente autor edita, OWNER pode excluir, não membro recebe 404', async () => {
  const r = await req(member, 'POST', `/tasks/${taskId}/comments`, { body: ' hello ' });
  expect(r.statusCode).toBe(201);
  const c = r.json<Result>();
  expect(c.body).toBe('hello');
  expect(r.json()).not.toHaveProperty('authorId');
  expect(
    (await req(owner, 'PATCH', `/comments/${c.id}`, { body: 'hack' })).statusCode,
  ).toBe(403);
  for (const method of ['PATCH', 'DELETE'] as const)
    expect(
      (await req(outsider, method, `/comments/${c.id}`, { body: 'hack' })).statusCode,
    ).toBe(404);
  expect(
    (await req(member, 'PATCH', `/comments/${c.id}`, { body: 'changed' })).json<Result>()
      .body,
  ).toBe('changed');
  expect(
    (await req(member, 'PATCH', `/comments/${c.id}`, { body: ' ' })).statusCode,
  ).toBe(400);
  expect((await req(owner, 'GET', `/tasks/${taskId}`)).json<Result>().commentCount).toBe(
    1,
  );
  expect((await req(owner, 'DELETE', `/comments/${c.id}`)).statusCode).toBe(204);
  expect((await req(owner, 'GET', `/tasks/${taskId}`)).json<Result>().commentCount).toBe(
    0,
  );
});
it('pagina comentários e preserva autor null após exclusão da conta', async () => {
  for (const body of ['one', 'two'])
    await req(member, 'POST', `/tasks/${taskId}/comments`, { body });
  const page = (
    await req(owner, 'GET', `/tasks/${taskId}/comments?limit=1`)
  ).json<Page>();
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  expect(
    (
      await req(owner, 'GET', `/tasks/${taskId}/comments?cursor=${page.nextCursor}`)
    ).json<Page>().items,
  ).toHaveLength(1);
  await app.prisma.user.delete({ where: { email: 'member@test.com' } });
  const result = (await req(owner, 'GET', `/tasks/${taskId}/comments`)).json<Page>();
  expect(result.items.map((c) => c.author)).toEqual([null, null]);
  await req(owner, 'DELETE', `/projects/${projectId}`);
  expect(await app.prisma.comment.count()).toBe(0);
});
