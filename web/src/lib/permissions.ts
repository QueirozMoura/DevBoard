import type { Comment, Role, Task } from '../api/types';

/**
 * Matriz de autorização de docs/api-contract.md §4. A API é sempre a autoridade (403/404);
 * estas regras só escondem ações que o usuário sabidamente não pode executar.
 */
export const can = {
  editProject: (role: Role): boolean => role === 'OWNER',
  deleteProject: (role: Role): boolean => role === 'OWNER',
  manageMembers: (role: Role): boolean => role === 'OWNER',
  /** OWNER remove qualquer um; MEMBER só a si mesmo (sair do projeto). */
  removeMember: (role: Role, isSelf: boolean): boolean => role === 'OWNER' || isSelf,
  /** Excluir tarefa: quem a criou ou um OWNER. */
  deleteTask: (role: Role, task: Pick<Task, 'createdById'>, userId: string): boolean =>
    role === 'OWNER' || task.createdById === userId,
  /** Editar comentário: somente o autor. */
  editComment: (comment: Pick<Comment, 'author'>, userId: string): boolean =>
    comment.author?.id === userId,
  /** Excluir comentário: o autor ou um OWNER. */
  deleteComment: (
    role: Role,
    comment: Pick<Comment, 'author'>,
    userId: string,
  ): boolean => role === 'OWNER' || comment.author?.id === userId,
};
