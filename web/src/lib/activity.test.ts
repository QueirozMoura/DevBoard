import { describe, expect, it } from 'vitest';
import type { Activity } from '../api/types';
import { describeActivity, timeAgo } from './activity';

const base: Activity = {
  id: 'a',
  projectId: 'p',
  taskId: null,
  actor: { id: 'u', name: 'Marina' },
  type: 'PROJECT_CREATED',
  data: {},
  createdAt: '2026-11-15T12:00:00.000Z',
};
const text = (over: Partial<Activity>) => describeActivity({ ...base, ...over });

describe('descrição de atividades', () => {
  it('descreve cada tipo em português com o ator', () => {
    expect(text({})).toBe('Marina criou o projeto');
    expect(
      text({ type: 'PROJECT_UPDATED', data: { changes: ['name', 'description'] } }),
    ).toBe('Marina editou o projeto (nome, descrição)');
    expect(text({ type: 'MEMBER_ADDED', data: { name: 'Rafael', role: 'MEMBER' } })).toBe(
      'Marina adicionou Rafael como membro',
    );
    expect(
      text({
        type: 'MEMBER_ROLE_CHANGED',
        data: { name: 'Rafael', from: 'MEMBER', to: 'OWNER' },
      }),
    ).toBe('Marina mudou o papel de Rafael de membro para proprietário');
    expect(text({ type: 'MEMBER_REMOVED', data: { name: 'Rafael' } })).toBe(
      'Marina removeu Rafael do projeto',
    );
    expect(text({ type: 'TASK_CREATED', data: { title: 'Login' } })).toBe(
      'Marina criou a tarefa “Login”',
    );
    expect(
      text({
        type: 'TASK_UPDATED',
        data: { title: 'Login', changes: ['priority', 'assigneeId'] },
      }),
    ).toBe('Marina editou a tarefa “Login” (prioridade, responsável)');
    expect(
      text({ type: 'TASK_MOVED', data: { title: 'Login', from: 'TODO', to: 'DONE' } }),
    ).toBe('Marina moveu “Login” de a fazer para concluída');
    expect(text({ type: 'TASK_DELETED', data: { title: 'Login' } })).toBe(
      'Marina excluiu a tarefa “Login”',
    );
    expect(text({ type: 'COMMENT_ADDED', data: { title: 'Login' } })).toBe(
      'Marina comentou em “Login”',
    );
  });
  it('tolera ator removido e dados ausentes', () => {
    expect(text({ actor: null, type: 'TASK_DELETED' })).toBe('Alguém excluiu uma tarefa');
    expect(text({ type: 'MEMBER_ADDED' })).toBe('Marina adicionou um membro');
  });
  it('formata o tempo relativo', () => {
    const now = new Date('2026-11-15T12:00:00.000Z').getTime();
    expect(timeAgo('2026-11-15T11:59:50.000Z', now)).toBe('agora');
    expect(timeAgo('2026-11-15T11:30:00.000Z', now)).toMatch(/30 minutos/);
    expect(timeAgo('2026-11-14T12:00:00.000Z', now)).toBe('ontem');
  });
});
