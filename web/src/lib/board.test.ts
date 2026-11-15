import { describe, expect, it } from 'vitest';
import type { Board, Task, TaskStatus } from '../api/types';
import {
  afterTaskIdOf,
  applyMoveToBoard,
  columnId,
  type Columns,
  lastTaskIdOf,
  matchesFilters,
  NO_FILTERS,
  previewMove,
  removeTaskFromBoard,
  statusFromColumnId,
  toColumns,
  upsertTaskInBoard,
} from './board';

const task = (id: string, status: TaskStatus, over: Partial<Task> = {}): Task => ({
  id,
  projectId: 'p',
  title: `Tarefa ${id}`,
  description: null,
  status,
  priority: 'MEDIUM',
  assigneeId: null,
  dueDate: null,
  position: id,
  createdById: null,
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const board = (): Board => ({
  columns: [
    {
      status: 'TODO',
      tasks: [task('a', 'TODO'), task('b', 'TODO'), task('c', 'TODO')],
      total: 3,
      hasMore: false,
      nextCursor: null,
    },
    {
      status: 'IN_PROGRESS',
      tasks: [task('d', 'IN_PROGRESS')],
      total: 1,
      hasMore: false,
      nextCursor: null,
    },
    { status: 'IN_REVIEW', tasks: [], total: 0, hasMore: false, nextCursor: null },
    {
      status: 'DONE',
      tasks: [task('e', 'DONE')],
      total: 1,
      hasMore: false,
      nextCursor: null,
    },
  ],
});

const ids = (columns: Columns, status: TaskStatus): string[] =>
  columns[status].map((t) => t.id);

describe('afterTaskId (contrato do POST /tasks/{id}/move)', () => {
  const columns = toColumns(board());
  it('é null no topo da coluna e o id da tarefa de cima nos demais casos', () => {
    expect(afterTaskIdOf(columns, 'a')).toBeNull();
    expect(afterTaskIdOf(columns, 'b')).toBe('a');
    expect(afterTaskIdOf(columns, 'c')).toBe('b');
    expect(afterTaskIdOf(columns, 'inexistente')).toBeNull();
  });
  it('para o fim da coluna usa a última tarefa, ignorando a própria', () => {
    expect(lastTaskIdOf(columns, 'TODO')).toBe('c');
    expect(lastTaskIdOf(columns, 'TODO', 'c')).toBe('b');
    expect(lastTaskIdOf(columns, 'IN_REVIEW')).toBeNull();
  });
});

describe('prévia do arraste', () => {
  it('reordena dentro da coluna', () => {
    const next = previewMove(toColumns(board()), 'a', 'c');
    expect(ids(next, 'TODO')).toEqual(['b', 'c', 'a']);
  });
  it('move entre colunas inserindo antes do cartão alvo, ou depois quando solto na metade de baixo', () => {
    const before = previewMove(toColumns(board()), 'a', 'd', false);
    expect(ids(before, 'TODO')).toEqual(['b', 'c']);
    expect(ids(before, 'IN_PROGRESS')).toEqual(['a', 'd']);
    expect(before.IN_PROGRESS[0]?.status).toBe('IN_PROGRESS');
    const after = previewMove(toColumns(board()), 'a', 'd', true);
    expect(ids(after, 'IN_PROGRESS')).toEqual(['d', 'a']);
  });
  it('solto sobre uma coluna vazia ou sobre o corpo da coluna, vai para o fim', () => {
    const empty = previewMove(toColumns(board()), 'a', columnId('IN_REVIEW'));
    expect(ids(empty, 'IN_REVIEW')).toEqual(['a']);
    const end = previewMove(toColumns(board()), 'a', columnId('DONE'));
    expect(ids(end, 'DONE')).toEqual(['e', 'a']);
  });
  it('é imutável e ignora alvos desconhecidos', () => {
    const original = toColumns(board());
    previewMove(original, 'a', 'd');
    expect(ids(original, 'TODO')).toEqual(['a', 'b', 'c']);
    expect(previewMove(original, 'a', 'zzz')).toBe(original);
  });
  it('o resultado do arraste gera o afterTaskId correto', () => {
    const next = previewMove(toColumns(board()), 'a', 'e', true);
    expect(afterTaskIdOf(next, 'a')).toBe('e');
    const top = previewMove(toColumns(board()), 'c', 'a', false);
    expect(afterTaskIdOf(top, 'c')).toBeNull();
  });
});

describe('atualização otimista do quadro', () => {
  it('move entre colunas ajustando status e totais', () => {
    const next = applyMoveToBoard(board(), 'b', 'IN_PROGRESS', 'd');
    const cols = toColumns(next);
    expect(ids(cols, 'TODO')).toEqual(['a', 'c']);
    expect(ids(cols, 'IN_PROGRESS')).toEqual(['d', 'b']);
    expect(cols.IN_PROGRESS[1]?.status).toBe('IN_PROGRESS');
    expect(next.columns.map((c) => c.total)).toEqual([2, 2, 0, 1]);
  });
  it('afterTaskId null coloca no topo; mesma coluna não altera totais', () => {
    const top = applyMoveToBoard(board(), 'c', 'TODO', null);
    expect(ids(toColumns(top), 'TODO')).toEqual(['c', 'a', 'b']);
    expect(top.columns[0]?.total).toBe(3);
  });
  it('cria, atualiza (inclusive mudando de coluna) e remove mantendo os totais', () => {
    const created = upsertTaskInBoard(board(), task('n', 'IN_REVIEW'));
    expect(created.columns[2]?.total).toBe(1);
    const moved = upsertTaskInBoard(created, task('n', 'DONE', { title: 'Novo título' }));
    expect(moved.columns[2]?.total).toBe(0);
    expect(moved.columns[3]?.total).toBe(2);
    expect(toColumns(moved).DONE.find((t) => t.id === 'n')?.title).toBe('Novo título');
    const edited = upsertTaskInBoard(moved, task('n', 'DONE', { title: 'Outro' }));
    expect(edited.columns[3]?.total).toBe(2);
    const removed = removeTaskFromBoard(edited, 'n');
    expect(removed.columns[3]?.total).toBe(1);
    expect(removeTaskFromBoard(removed, 'inexistente').columns[3]?.total).toBe(1);
  });
});

describe('ids de coluna e filtros', () => {
  it('converte id de coluna em status', () => {
    expect(statusFromColumnId(columnId('DONE'))).toBe('DONE');
    expect(statusFromColumnId('column:INVALIDO')).toBeNull();
    expect(statusFromColumnId('uuid-qualquer')).toBeNull();
  });
  it('combina texto, prioridade e responsável', () => {
    const t = task('x', 'TODO', {
      title: 'Revisar Antifraude',
      priority: 'HIGH',
      assigneeId: 'u1',
    });
    expect(matchesFilters(t, NO_FILTERS)).toBe(true);
    expect(matchesFilters(t, { ...NO_FILTERS, q: ' antifraude ' })).toBe(true);
    expect(matchesFilters(t, { ...NO_FILTERS, q: 'pagamento' })).toBe(false);
    expect(matchesFilters(t, { ...NO_FILTERS, priority: 'LOW' })).toBe(false);
    expect(matchesFilters(t, { ...NO_FILTERS, assignee: 'u1' })).toBe(true);
    expect(matchesFilters(t, { ...NO_FILTERS, assignee: 'u2' })).toBe(false);
    expect(matchesFilters(t, { ...NO_FILTERS, assignee: 'unassigned' })).toBe(false);
    expect(
      matchesFilters(task('y', 'TODO'), { ...NO_FILTERS, assignee: 'unassigned' }),
    ).toBe(true);
  });
});
