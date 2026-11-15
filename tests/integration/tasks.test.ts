import { at, type Result, type Page, type Board } from '../helpers/api.js';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
const app = buildApp(loadEnv()),
  other = buildApp(loadEnv());
beforeAll(async () => {
  await Promise.all([app.ready(), other.ready()]);
});
afterAll(async () => {
  await Promise.all([app.close(), other.close()]);
});
let owner: string,
  member: string,
  outsider: string,
  memberId: string,
  outsiderId: string,
  projectId: string;
const req = (
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: object,
  instance = app,
) =>
  instance.inject({
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
  [owner, member, outsider] = (await Promise.all(
    users.map((u) => app.accessTokens.sign(u.id)),
  )) as [string, string, string];
  memberId = at(users, 1).id;
  outsiderId = at(users, 2).id;
  projectId = (await req(owner, 'POST', '/projects', { name: 'project' })).json<Result>()
    .id;
  await req(owner, 'POST', `/projects/${projectId}/members`, {
    email: 'member@test.com',
  });
});
const create = async (title: string, extra: object = {}, token = owner) => {
  const r = await req(token, 'POST', `/projects/${projectId}/tasks`, { title, ...extra });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<Result>();
};
it('CRUD, filtros, validação, responsável e autorização aninhada', async () => {
  const a = await create(' Alpha ', { assigneeId: memberId, priority: 'HIGH' });
  expect(a).toMatchObject({ title: 'Alpha', status: 'TODO', commentCount: 0 });
  expect((await req(member, 'DELETE', `/tasks/${a.id}`)).statusCode).toBe(403);
  for (const method of ['GET', 'PATCH', 'DELETE'] as const)
    expect(
      (
        await req(
          outsider,
          method,
          `/tasks/${a.id}`,
          method === 'PATCH' ? { title: 'hack' } : undefined,
        )
      ).statusCode,
    ).toBe(404);
  expect(
    (await req(outsider, 'POST', `/tasks/${a.id}/move`, { afterTaskId: null }))
      .statusCode,
  ).toBe(404);
  expect(
    (await req(member, 'PATCH', `/tasks/${a.id}`, { status: 'DONE' })).statusCode,
  ).toBe(400);
  expect((await req(member, 'PATCH', `/tasks/${a.id}`, {})).statusCode).toBe(400);
  expect(
    (
      await req(member, 'PATCH', `/tasks/${a.id}`, { assigneeId: outsiderId })
    ).json<Result>().error,
  ).toBe('INVALID_ASSIGNEE');
  await create('Beta', { status: 'DONE' });
  const list = (
    await req(
      member,
      'GET',
      `/projects/${projectId}/tasks?priority=HIGH&q=alpha&assigneeId=${memberId}`,
    )
  ).json<Page>();
  expect(list.items.map((t: { id: string }) => t.id)).toEqual([a.id]);
  await req(owner, 'DELETE', `/projects/${projectId}/members/${memberId}`);
  expect(
    (await req(owner, 'GET', `/tasks/${a.id}`)).json<Result>().assigneeId,
  ).toBeNull();
  expect(
    (await req(owner, 'GET', `/projects/${projectId}`)).json<Result>().taskCount,
  ).toBe(2);
  expect((await req(owner, 'DELETE', `/tasks/${a.id}`)).statusCode).toBe(204);
});
it('board, cursor de coluna, rank e alvos inválidos', async () => {
  const a = await create('a'),
    b = await create('b'),
    c = await create('c'),
    done = await create('done', { status: 'DONE' });
  const board = (
    await req(owner, 'GET', `/projects/${projectId}/board?limitPerColumn=1`)
  ).json<Board>();
  expect(board.columns.map((c: { status: string }) => c.status)).toEqual([
    'TODO',
    'IN_PROGRESS',
    'IN_REVIEW',
    'DONE',
  ]);
  expect(at(board.columns, 0)).toMatchObject({ total: 3, hasMore: true });
  const cursor = at(board.columns, 0).nextCursor;
  expect(
    (await req(owner, 'GET', `/projects/${projectId}/tasks?status=TODO&cursor=${cursor}`))
      .json<Page>()
      .items.map((t: { id: string }) => t.id),
  ).toEqual([b.id, c.id]);
  expect(
    (
      await req(owner, 'GET', `/projects/${projectId}/tasks?status=DONE&cursor=${cursor}`)
    ).json<Result>().error,
  ).toBe('INVALID_CURSOR');
  for (const target of [c.id, done.id])
    expect(
      (
        await req(owner, 'POST', `/tasks/${c.id}/move`, { afterTaskId: target })
      ).json<Result>().error,
    ).toBe('INVALID_MOVE_TARGET');
  expect(
    (await req(member, 'POST', `/tasks/${c.id}/move`, { afterTaskId: a.id })).statusCode,
  ).toBe(200);
  const tasks = (
    await req(owner, 'GET', `/projects/${projectId}/tasks?status=TODO`)
  ).json<Page>().items;
  expect(tasks.map((t: { id: string }) => t.id)).toEqual([a.id, c.id, b.id]);
  expect(new Set(tasks.map((t: { position: string }) => t.position)).size).toBe(3);
  expect(
    (
      await req(member, 'POST', `/tasks/${c.id}/move`, {
        status: 'DONE',
        afterTaskId: null,
      })
    ).json<Result>().status,
  ).toBe('DONE');
});
it('serializa criação e movimentos entre instâncias sem ranks duplicados', async () => {
  const anchor = await create('anchor');
  const rows = await Promise.all(
    Array.from({ length: 8 }, (_, i) => create(`task ${i}`)),
  );
  const moves = await Promise.all(
    rows.map((row, i) =>
      req(
        member,
        'POST',
        `/tasks/${row.id}/move`,
        { afterTaskId: anchor.id },
        i % 2 ? app : other,
      ),
    ),
  );
  expect(moves.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
  const tasks = (await req(owner, 'GET', `/projects/${projectId}/tasks`)).json<Page>()
    .items;
  expect(new Set(tasks.map((t: { position: string }) => t.position)).size).toBe(9);
  expect(at(tasks, 0).id).toBe(anchor.id);
});
it('rebalanceia ranks esgotados e rejeita alvo que saiu da coluna', async () => {
  const a = await create('a'),
    b = await create('b');
  await app.prisma.task.update({
    where: { id: a.id },
    data: { position: '000000000000000000000000000001' },
  });
  expect(
    (await req(owner, 'POST', `/tasks/${b.id}/move`, { afterTaskId: null })).statusCode,
  ).toBe(200);
  await req(owner, 'POST', `/tasks/${a.id}/move`, { status: 'DONE', afterTaskId: null });
  expect(
    (await req(owner, 'POST', `/tasks/${b.id}/move`, { afterTaskId: a.id })).statusCode,
  ).toBe(422);
});

it('isola referências de outro projeto e limpa campos anuláveis', async () => {
  const foreign = (
    await req(outsider, 'POST', '/projects', { name: 'foreign' })
  ).json<Result>();
  const foreignTask = (
    await req(outsider, 'POST', `/projects/${foreign.id}/tasks`, { title: 'foreign' })
  ).json<Result>();
  const task = await create('dates', {
    dueDate: '2026-11-15T12:00:00-03:00',
    assigneeId: memberId,
    description: 'description',
  });
  const invalid = await req(member, 'POST', `/tasks/${task.id}/move`, {
    afterTaskId: foreignTask.id,
  });
  expect(invalid.json<Result>().error).toBe('INVALID_MOVE_TARGET');
  const updated = await req(member, 'PATCH', `/tasks/${task.id}`, {
    dueDate: null,
    assigneeId: null,
    description: null,
  });
  expect(updated.statusCode).toBe(200);
  expect(updated.json()).toMatchObject({
    dueDate: null,
    assigneeId: null,
    description: null,
  });
  expect(
    (
      await req(member, 'GET', `/projects/${projectId}/tasks?unassigned=true`)
    ).json<Page>().items,
  ).toHaveLength(1);
  expect(
    (
      await req(
        member,
        'GET',
        `/projects/${projectId}/tasks?unassigned=true&assigneeId=${memberId}`,
      )
    ).statusCode,
  ).toBe(400);
});
it('remoção de membro concorrente com atribuição termina sem responsável removido', async () => {
  const task = await create('race');
  const results = await Promise.all([
    req(owner, 'PATCH', `/tasks/${task.id}`, { assigneeId: memberId }, other),
    req(owner, 'DELETE', `/projects/${projectId}/members/${memberId}`),
  ]);
  expect([200, 422]).toContain(at(results, 0).statusCode);
  expect(at(results, 1).statusCode).toBe(204);
  expect(
    (await req(owner, 'GET', `/tasks/${task.id}`)).json<Result>().assigneeId,
  ).toBeNull();
  expect((await req(member, 'GET', `/tasks/${task.id}`)).statusCode).toBe(404);
});
it('cursor prossegue após exclusão do item âncora e cruza colunas', async () => {
  const first = await create('first');
  const second = await create('second', { status: 'DONE' });
  const page = (
    await req(owner, 'GET', `/projects/${projectId}/tasks?limit=1`)
  ).json<Page>();
  await req(owner, 'DELETE', `/tasks/${first.id}`);
  const next = (
    await req(owner, 'GET', `/projects/${projectId}/tasks?cursor=${page.nextCursor}`)
  ).json<Page>();
  expect(next.items.map((t) => t.id)).toEqual([second.id]);
  expect(next.nextCursor).toBeNull();
});
