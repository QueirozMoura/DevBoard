import { describe, expect, it } from 'vitest';
import type { Task } from '../api/types';
import {
  draftFromTask,
  draftToCreate,
  draftToUpdate,
  dueToIso,
  emptyDraft,
  isoToDue,
  validateDraft,
} from './taskDraft';

const task: Task = {
  id: 't',
  projectId: 'p',
  title: 'Título',
  description: 'Texto',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  assigneeId: 'u1',
  dueDate: '2026-12-01T12:00:00.000Z',
  position: 'a0',
  createdById: 'u1',
  commentCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('rascunho de tarefa', () => {
  it('converte prazo de/para data sem mudar o dia', () => {
    expect(dueToIso('2026-12-01')).toBe('2026-12-01T12:00:00.000Z');
    expect(isoToDue('2026-12-01T12:00:00.000Z')).toBe('2026-12-01');
    expect(isoToDue(null)).toBe('');
  });

  it('valida título obrigatório e limites', () => {
    expect(validateDraft(emptyDraft()).title).toBe('Informe o título da tarefa.');
    expect(validateDraft({ ...emptyDraft(), title: '   ' }).title).toBeDefined();
    expect(validateDraft({ ...emptyDraft(), title: 'x'.repeat(201) }).title).toMatch(
      /200/,
    );
    expect(validateDraft({ ...emptyDraft(), title: 'ok' })).toEqual({});
    expect(
      validateDraft({ ...emptyDraft(), title: 'ok', description: 'x'.repeat(10_001) })
        .description,
    ).toBeDefined();
  });

  it('monta o corpo de criação conforme o contrato (null para vazio, texto aparado)', () => {
    expect(
      draftToCreate({
        ...emptyDraft('DONE'),
        title: '  Nova  ',
        description: '  ',
        dueDate: '2026-12-05',
      }),
    ).toEqual({
      title: 'Nova',
      description: null,
      status: 'DONE',
      priority: 'MEDIUM',
      assigneeId: null,
      dueDate: '2026-12-05T12:00:00.000Z',
    });
  });

  it('o PATCH envia apenas o que mudou e nunca status/posição', () => {
    const same = draftFromTask(task);
    expect(draftToUpdate(same, task)).toEqual({});
    expect(draftToUpdate({ ...same, title: ' Outro ', priority: 'LOW' }, task)).toEqual({
      title: 'Outro',
      priority: 'LOW',
    });
    expect(
      draftToUpdate({ ...same, assigneeId: '', dueDate: '', description: '' }, task),
    ).toEqual({
      assigneeId: null,
      dueDate: null,
      description: null,
    });
    const changed = draftToUpdate({ ...same, status: 'DONE' }, task);
    expect(changed).not.toHaveProperty('status');
    expect(changed).not.toHaveProperty('position');
  });
});
