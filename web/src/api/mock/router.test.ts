import { beforeEach, describe, expect, it } from 'vitest';
import {
  activitiesApi,
  commentsApi,
  membersApi,
  projectsApi,
  tasksApi,
} from '../endpoints';
import { tokenStore } from '../tokenStore';
import type { Board, Page, Project, Task } from '../types';
import { resetClientState, USER } from '../../test/utils';
import { resetMockStore } from './store';

beforeEach(() => {
  resetClientState();
  tokenStore.set('token-de-teste');
  resetMockStore(USER);
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

describe('servidor simulado: escrita e autorização', () => {
  const find = async (name: string): Promise<Project> => {
    const project = (await projectsApi.list()).items.find((p) => p.name === name);
    if (!project) throw new Error(`projeto ${name} ausente`);
    return project;
  };

  it('edita e exclui projeto apenas como OWNER (MEMBER recebe 403)', async () => {
    const mine = await find('Plataforma de Pagamentos');
    const updated = await projectsApi.update(mine.id, {
      name: 'Pagamentos 2',
      description: null,
    });
    expect(updated).toMatchObject({ name: 'Pagamentos 2', description: null });

    const foreign = await find('App Mobile v2');
    await expect(projectsApi.update(foreign.id, { name: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    await expect(projectsApi.remove(foreign.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await projectsApi.remove(mine.id);
    await expect(projectsApi.get(mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejeita corpo com campo extra ou vazio (contrato estrito)', async () => {
    const project = await find('Site Institucional');
    await expect(projectsApi.update(project.id, {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const error = await projectsApi
      .update(project.id, { name: 'ok', extra: 1 } as never)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'extra' })],
    });
  });

  it('membros: adicionar por e-mail, duplicado, inexistente, papel e último OWNER', async () => {
    const project = await find('Plataforma de Pagamentos');
    await expect(
      membersApi.add(project.id, { email: 'ninguem@x.dev' }),
    ).rejects.toMatchObject({ code: 'INVITEE_NOT_FOUND', status: 404 });
    await expect(
      membersApi.add(project.id, { email: 'marina@devboard.dev' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER', status: 409 });
    const added = await membersApi.add(project.id, {
      email: 'Isabela@devboard.dev',
      role: 'MEMBER',
    });
    expect(added).toMatchObject({ name: 'Isabela Nunes', role: 'MEMBER' });
    expect((await membersApi.list(project.id)).items).toHaveLength(4);

    await expect(membersApi.setRole(project.id, USER.id, 'MEMBER')).rejects.toMatchObject(
      { code: 'LAST_OWNER' },
    );
    await expect(membersApi.remove(project.id, USER.id)).rejects.toMatchObject({
      code: 'LAST_OWNER',
    });
    await membersApi.setRole(project.id, added.userId, 'OWNER');
    await membersApi.setRole(project.id, USER.id, 'MEMBER');
    // Agora é só MEMBER: não gerencia mais, mas pode sair.
    await expect(
      membersApi.add(project.id, { email: 'rafael@devboard.dev' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const marina = (await membersApi.list(project.id)).items.find(
      (m) => m.name === 'Marina Duarte',
    );
    await expect(
      membersApi.remove(project.id, marina?.userId ?? ''),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await membersApi.remove(project.id, USER.id);
    await expect(projectsApi.get(project.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remover membro desatribui as tarefas dele', async () => {
    const project = await find('Plataforma de Pagamentos');
    const rafael = (await membersApi.list(project.id)).items.find(
      (m) => m.name === 'Rafael Costa',
    );
    expect(
      (await tasksApi.list(project.id, { assigneeId: rafael?.userId })).items.length,
    ).toBeGreaterThan(0);
    await membersApi.remove(project.id, rafael?.userId ?? '');
    expect(
      (await tasksApi.list(project.id, { assigneeId: rafael?.userId })).items,
    ).toHaveLength(0);
  });

  it('tarefas: cria no fim da coluna, valida responsável, edita e exclui conforme a matriz', async () => {
    const project = await find('Plataforma de Pagamentos');
    const created = await tasksApi.create(project.id, {
      title: '  Nova  ',
      priority: 'HIGH',
      assigneeId: USER.id,
    });
    expect(created).toMatchObject({
      title: 'Nova',
      status: 'TODO',
      priority: 'HIGH',
      createdById: USER.id,
    });
    const board = await tasksApi.board(project.id);
    expect(board.columns[0]?.tasks.at(-1)?.id).toBe(created.id);

    await expect(
      tasksApi.create(project.id, {
        title: 'x',
        assigneeId: '00000000-0000-7000-8000-00000000ffff',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ASSIGNEE', status: 422 });
    const edited = await tasksApi.update(created.id, {
      title: 'Renomeada',
      dueDate: null,
      assigneeId: null,
    });
    expect(edited).toMatchObject({ title: 'Renomeada', assigneeId: null });
    await tasksApi.remove(created.id);
    await expect(tasksApi.get(created.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Em "App Mobile v2" o usuário é MEMBER e não criou as tarefas seed.
    const mobile = await find('App Mobile v2');
    const seeded = (await tasksApi.list(mobile.id)).items[0];
    await expect(tasksApi.remove(seeded?.id ?? '')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('move com afterTaskId: reordena, troca de coluna e rejeita alvo inválido (422)', async () => {
    const project = await find('Plataforma de Pagamentos');
    const [first, second] = (await tasksApi.list(project.id, { status: 'TODO' })).items;
    if (!first || !second) throw new Error('seed inesperado');

    const moved = await tasksApi.move(first.id, { afterTaskId: second.id });
    expect(moved.status).toBe('TODO');
    expect(
      (await tasksApi.list(project.id, { status: 'TODO' })).items.map((t) => t.id),
    ).toEqual([second.id, first.id]);

    const toReview = await tasksApi.move(second.id, {
      status: 'IN_REVIEW',
      afterTaskId: null,
    });
    expect(toReview.status).toBe('IN_REVIEW');
    const column = (await tasksApi.board(project.id)).columns.find(
      (c) => c.status === 'IN_REVIEW',
    );
    expect(column?.tasks[0]?.id).toBe(second.id);

    await expect(
      tasksApi.move(first.id, { afterTaskId: first.id }),
    ).rejects.toMatchObject({ code: 'INVALID_MOVE_TARGET', status: 422 });
    await expect(
      tasksApi.move(first.id, { status: 'DONE', afterTaskId: second.id }),
    ).rejects.toMatchObject({ code: 'INVALID_MOVE_TARGET' });
    await expect(tasksApi.move(first.id, {} as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('comentários: contagem, autoria, edição só do autor e exclusão', async () => {
    const project = await find('Plataforma de Pagamentos');
    const task = (await tasksApi.list(project.id)).items[0];
    if (!task) throw new Error('seed inesperado');
    const comment = await commentsApi.create(task.id, '  Ótimo  ');
    expect(comment).toMatchObject({ body: 'Ótimo', author: { id: USER.id } });
    expect((await tasksApi.get(task.id)).commentCount).toBe(1);
    expect((await commentsApi.update(comment.id, 'Editado')).body).toBe('Editado');
    await expect(commentsApi.create(task.id, '   ')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await commentsApi.remove(comment.id);
    expect((await commentsApi.list(task.id)).items).toHaveLength(0);
    expect((await tasksApi.get(task.id)).commentCount).toBe(0);
  });

  it('atividades são geradas pelo servidor, mais recentes primeiro, e filtram por tarefa', async () => {
    const project = await find('Plataforma de Pagamentos');
    const task = await tasksApi.create(project.id, { title: 'Histórico' });
    await tasksApi.update(task.id, { priority: 'URGENT' });
    await tasksApi.move(task.id, { status: 'DONE', afterTaskId: null });
    await tasksApi.move(task.id, { afterTaskId: null }); // mesma coluna: sem atividade
    await commentsApi.create(task.id, 'oi');

    const all = await activitiesApi.list(project.id);
    expect(all.items.slice(0, 4).map((a) => a.type)).toEqual([
      'COMMENT_ADDED',
      'TASK_MOVED',
      'TASK_UPDATED',
      'TASK_CREATED',
    ]);
    const own = await activitiesApi.list(project.id, { taskId: task.id });
    expect(own.items).toHaveLength(4);
    const moves = await activitiesApi.list(project.id, { type: 'TASK_MOVED' });
    expect(moves.items.every((a) => a.type === 'TASK_MOVED')).toBe(true);

    await tasksApi.remove(task.id);
    const afterDelete = await activitiesApi.list(project.id);
    expect(afterDelete.items[0]).toMatchObject({ type: 'TASK_DELETED', taskId: null });
    expect(afterDelete.items.filter((a) => a.taskId === task.id)).toHaveLength(0);
  });
});
