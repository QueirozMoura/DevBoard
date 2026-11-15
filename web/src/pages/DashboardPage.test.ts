import { describe, expect, it } from 'vitest';
import type { Board, Task } from '../api/types';
import { countByStatus, sortMyTasks } from './DashboardPage';

const task = (over: Partial<Task>): Task => ({
  id: 'x',
  projectId: 'p',
  title: 't',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  assigneeId: null,
  dueDate: null,
  position: 'a0000',
  createdById: null,
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('regras do painel', () => {
  it('ordena por prazo (sem prazo por último) e, no empate, por prioridade', () => {
    const sorted = sortMyTasks([
      task({ id: 'sem-prazo', priority: 'URGENT' }),
      task({ id: 'depois', dueDate: '2026-12-10T00:00:00.000Z', priority: 'LOW' }),
      task({ id: 'cedo-media', dueDate: '2026-12-01T00:00:00.000Z', priority: 'MEDIUM' }),
      task({
        id: 'cedo-urgente',
        dueDate: '2026-12-01T00:00:00.000Z',
        priority: 'URGENT',
      }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      'cedo-urgente',
      'cedo-media',
      'depois',
      'sem-prazo',
    ]);
  });

  it('soma os totais por status de vários quadros, ignorando quadros ainda não carregados', () => {
    const board = (todo: number, done: number): Board => ({
      columns: (['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((status) => ({
        status,
        tasks: [],
        total: status === 'TODO' ? todo : status === 'DONE' ? done : 0,
        hasMore: false,
        nextCursor: null,
      })),
    });
    expect(countByStatus([board(2, 1), undefined, board(3, 4)])).toEqual({
      TODO: 5,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 5,
    });
  });
});
