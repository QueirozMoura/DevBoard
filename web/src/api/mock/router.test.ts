import { beforeEach, describe, expect, it } from 'vitest';
import { projectsApi, tasksApi } from '../endpoints';
import { tokenStore } from '../tokenStore';
import type { Board, Page, Project, Task } from '../types';
import { resetClientState, USER } from '../../test/utils';
import { setMockUser } from './router';

beforeEach(() => {
  resetClientState();
  tokenStore.set('token-de-teste');
  setMockUser(USER);
});

describe('servidor simulado (planned)', () => {
  it('lista só projetos em que o usuário é membro, com papel e contagens', async () => {
    const page: Page<Project> = await projectsApi.list();
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
    const roles = Object.fromEntries(page.items.map((p) => [p.name, p.myRole]));
    expect(roles).toEqual({
      'Plataforma de Pagamentos': 'OWNER',
      'App Mobile v2': 'MEMBER',
      'Site Institucional': 'OWNER',
    });
    expect(page.items.every((p) => p.taskCount > 0 && p.memberCount >= 2)).toBe(true);
  });

  it('pagina por cursor opaco e rejeita cursor adulterado', async () => {
    const first = await projectsApi.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await projectsApi.list({ limit: 2, cursor: first.nextCursor ?? '' });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    await expect(projectsApi.list({ cursor: '%%%' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
      status: 400,
    });
  });

  it('projeto inexistente ou de não membro responde 404 NOT_FOUND', async () => {
    await expect(
      projectsApi.get('00000000-0000-7000-8000-00000000ffff'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('o quadro tem sempre 4 colunas em ordem, com totais e limite por coluna', async () => {
    const [project] = (await projectsApi.list()).items.filter(
      (p) => p.name === 'Plataforma de Pagamentos',
    );
    const board: Board = await tasksApi.board(project?.id ?? '', 1);
    expect(board.columns.map((c) => c.status)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
      'DONE',
    ]);
    const todo = board.columns[0];
    expect(todo?.total).toBe(2);
    expect(todo?.tasks).toHaveLength(1);
    expect(todo?.hasMore).toBe(true);
    expect(todo?.nextCursor).not.toBeNull();
  });

  it('filtra tarefas por responsável, status e texto', async () => {
    const [project] = (await projectsApi.list()).items.filter(
      (p) => p.name === 'Plataforma de Pagamentos',
    );
    const id = project?.id ?? '';
    const mine: Page<Task> = await tasksApi.list(id, { assigneeId: USER.id });
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((t) => t.assigneeId === USER.id)).toBe(true);
    const done = await tasksApi.list(id, { status: 'DONE' });
    expect(done.items.every((t) => t.status === 'DONE')).toBe(true);
    const found = await tasksApi.list(id, { q: 'antifraude' });
    expect(found.items.map((t) => t.title)).toEqual(['Integrar antifraude no checkout']);
    const none = await tasksApi.list(id, { unassigned: true });
    expect(none.items.every((t) => t.assigneeId === null)).toBe(true);
  });

  it('cria projeto com o usuário como OWNER e valida o nome', async () => {
    const created = await projectsApi.create({ name: '  Novo projeto  ' });
    expect(created).toMatchObject({
      name: 'Novo projeto',
      myRole: 'OWNER',
      memberCount: 1,
      taskCount: 0,
    });
    await expect(projectsApi.create({ name: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'name' })],
    });
  });
});
