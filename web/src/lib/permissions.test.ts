import { describe, expect, it } from 'vitest';
import { can } from './permissions';

describe('matriz de autorização (docs/api-contract.md §4)', () => {
  it('projeto e membros: só OWNER edita, exclui e gerencia', () => {
    expect(can.editProject('OWNER')).toBe(true);
    expect(can.editProject('MEMBER')).toBe(false);
    expect(can.deleteProject('MEMBER')).toBe(false);
    expect(can.manageMembers('OWNER')).toBe(true);
    expect(can.manageMembers('MEMBER')).toBe(false);
  });
  it('remover membro: OWNER qualquer um; MEMBER só a si mesmo', () => {
    expect(can.removeMember('OWNER', false)).toBe(true);
    expect(can.removeMember('MEMBER', true)).toBe(true);
    expect(can.removeMember('MEMBER', false)).toBe(false);
  });
  it('excluir tarefa: criador ou OWNER', () => {
    expect(can.deleteTask('MEMBER', { createdById: 'u1' }, 'u1')).toBe(true);
    expect(can.deleteTask('MEMBER', { createdById: 'u2' }, 'u1')).toBe(false);
    expect(can.deleteTask('OWNER', { createdById: 'u2' }, 'u1')).toBe(true);
    expect(can.deleteTask('MEMBER', { createdById: null }, 'u1')).toBe(false);
  });
  it('comentários: editar só o autor; excluir autor ou OWNER; autor removido (null) só OWNER exclui', () => {
    const mine = { author: { id: 'u1', name: 'Eu' } };
    const other = { author: { id: 'u2', name: 'Outro' } };
    expect(can.editComment(mine, 'u1')).toBe(true);
    expect(can.editComment(other, 'u1')).toBe(false);
    expect(can.deleteComment('MEMBER', mine, 'u1')).toBe(true);
    expect(can.deleteComment('MEMBER', other, 'u1')).toBe(false);
    expect(can.deleteComment('OWNER', other, 'u1')).toBe(true);
    expect(can.editComment({ author: null }, 'u1')).toBe(false);
    expect(can.deleteComment('OWNER', { author: null }, 'u1')).toBe(true);
  });
});
