import { at, type Result, type Page } from '../helpers/api.js';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
const app = buildApp(loadEnv());
beforeAll(() => app.ready());
afterAll(() => app.close());
let owner: string, member: string, outsider: string;
let ownerId: string, memberId: string;
beforeEach(async () => {
  await resetDatabase(app.prisma);
  const users = await Promise.all(
    ['owner', 'member', 'outsider'].map((name) =>
      app.prisma.user.create({
        data: { name, email: `${name}@test.com`, passwordHash: 'unused' },
      }),
    ),
  );
  [ownerId, memberId] = [at(users, 0).id, at(users, 1).id];
  [owner, member, outsider] = (await Promise.all(
    users.map((u) => app.accessTokens.sign(u.id)),
  )) as [string, string, string];
});
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
async function project() {
  const r = await req(owner, 'POST', '/projects', { name: ' Project ' });
  expect(r.statusCode).toBe(201);
  expect(r.json<Result>()).toMatchObject({
    name: 'Project',
    myRole: 'OWNER',
    memberCount: 1,
    taskCount: 0,
  });
  return `/projects/${r.json<Result>().id}`;
}
it('CRUD, isolamento, permissões, membros e último OWNER', async () => {
  const path = await project();
  expect((await req(outsider, 'GET', path)).statusCode).toBe(404);
  expect((await req(outsider, 'PATCH', path, { name: 'hack' })).statusCode).toBe(404);
  expect(
    (
      await req(owner, 'POST', `${path}/members`, { email: 'missing@test.com' })
    ).json<Result>().error,
  ).toBe('INVITEE_NOT_FOUND');
  expect(
    (await req(owner, 'POST', `${path}/members`, { email: ' MEMBER@test.com ' }))
      .statusCode,
  ).toBe(201);
  expect(
    (
      await req(owner, 'POST', `${path}/members`, { email: ' MEMBER@test.com ' })
    ).json<Result>().error,
  ).toBe('ALREADY_MEMBER');
  expect((await req(member, 'PATCH', path, { name: 'hack' })).statusCode).toBe(403);
  expect((await req(member, 'DELETE', `${path}/members/${ownerId}`)).statusCode).toBe(
    403,
  );
  expect(
    (await req(owner, 'DELETE', `${path}/members/${ownerId}`)).json<Result>().error,
  ).toBe('LAST_OWNER');
  expect(
    (
      await req(owner, 'PATCH', `${path}/members/${ownerId}`, { role: 'MEMBER' })
    ).json<Result>().error,
  ).toBe('LAST_OWNER');
  expect((await req(member, 'DELETE', `${path}/members/${memberId}`)).statusCode).toBe(
    204,
  );
  expect((await req(member, 'GET', `${path}/members`)).statusCode).toBe(404);
  expect(
    (await req(owner, 'PATCH', path, { description: 'desc' })).json<Result>().description,
  ).toBe('desc');
  expect((await req(owner, 'DELETE', path)).statusCode).toBe(204);
  expect((await req(owner, 'GET', path)).statusCode).toBe(404);
});
it('serializa rebaixamentos concorrentes e preserva um OWNER', async () => {
  const path = await project();
  await req(owner, 'POST', `${path}/members`, {
    email: 'member@test.com',
    role: 'OWNER',
  });
  const results = await Promise.all([
    req(owner, 'PATCH', `${path}/members/${ownerId}`, { role: 'MEMBER' }),
    req(member, 'PATCH', `${path}/members/${memberId}`, { role: 'MEMBER' }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
});
it('valida corpos e paginação vinculada ao usuário', async () => {
  expect(
    (await req(owner, 'POST', '/projects', { name: ' ', extra: 1 })).json<Result>()
      .details.length,
  ).toBeGreaterThan(0);
  await project();
  await project();
  const page = (await req(owner, 'GET', '/projects?limit=1')).json<Page>();
  expect(page.items).toHaveLength(1);
  expect(
    (await req(owner, 'GET', `/projects?cursor=${page.nextCursor}`)).json<Page>().items,
  ).toHaveLength(1);
  expect(
    (await req(outsider, 'GET', `/projects?cursor=${page.nextCursor}`)).json<Result>()
      .error,
  ).toBe('INVALID_CURSOR');
  expect((await req(owner, 'GET', '/projects?cursor=bad')).statusCode).toBe(400);
  expect(
    (
      await req(
        owner,
        'GET',
        `/projects?cursor=${encodeURIComponent('x.' + 'é'.repeat(43))}`,
      )
    ).json<Result>().error,
  ).toBe('INVALID_CURSOR');
  expect((await req(owner, 'GET', '/projects?limit=101')).statusCode).toBe(400);
});
