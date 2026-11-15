import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi, membersApi, projectsApi, tasksApi } from './api/endpoints';
import type {
  Board,
  ProjectCreate,
  ProjectUpdate,
  Role,
  Task,
  TaskCreate,
  TaskStatus,
  TaskUpdate,
} from './api/types';
import { applyMoveToBoard, removeTaskFromBoard, upsertTaskInBoard } from './lib/board';
import { keys } from './queries';

/** Após mudar membros/tarefas, refaz o que depende disso (contagens, histórico, quadro). */
export function refreshProjectData(client: QueryClient, projectId: string): void {
  void client.invalidateQueries({ queryKey: keys.project(projectId) });
  void client.invalidateQueries({ queryKey: keys.projects });
  void client.invalidateQueries({ queryKey: keys.activitiesPrefix(projectId) });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreate) => projectsApi.create(input),
    onSuccess: (project) => {
      client.setQueryData(keys.project(project.id), project);
      void client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectUpdate) => projectsApi.update(projectId, input),
    onSuccess: (project) => {
      client.setQueryData(keys.project(projectId), project);
      refreshProjectData(client, projectId);
    },
  });
}

export function useDeleteProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.remove(projectId),
    onSuccess: () => {
      for (const key of [
        keys.project(projectId),
        keys.members(projectId),
        keys.boardPrefix(projectId),
        keys.tasksPrefix(projectId),
        keys.activitiesPrefix(projectId),
      ]) {
        client.removeQueries({ queryKey: key });
      }
      void client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

function onMembersChanged(client: QueryClient, projectId: string): void {
  void client.invalidateQueries({ queryKey: keys.members(projectId) });
  // Remover um membro desatribui as tarefas dele.
  void client.invalidateQueries({ queryKey: keys.boardPrefix(projectId) });
  void client.invalidateQueries({ queryKey: keys.tasksPrefix(projectId) });
  refreshProjectData(client, projectId);
}

export function useAddMember(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: Role }) =>
      membersApi.add(projectId, input),
    onSuccess: () => {
      onMembersChanged(client, projectId);
    },
  });
}

export function useSetMemberRole(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: Role }) =>
      membersApi.setRole(projectId, input.userId, input.role),
    onSuccess: () => {
      onMembersChanged(client, projectId);
    },
  });
}

export function useRemoveMember(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => membersApi.remove(projectId, userId),
    onSuccess: () => {
      onMembersChanged(client, projectId);
    },
  });
}

// ---------- tarefas ----------

/** Atualiza o quadro completo em cache (os quadros reduzidos do painel são só invalidados). */
function patchBoard(
  client: QueryClient,
  projectId: string,
  patch: (board: Board) => Board,
) {
  client.setQueryData<Board>(keys.board(projectId), (board) =>
    board ? patch(board) : board,
  );
}

function onTasksChanged(client: QueryClient, projectId: string): void {
  void client.invalidateQueries({ queryKey: keys.boardPrefix(projectId) });
  void client.invalidateQueries({ queryKey: keys.tasksPrefix(projectId) });
  refreshProjectData(client, projectId);
}

export function useCreateTask(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreate) => tasksApi.create(projectId, input),
    onSuccess: (task) => {
      client.setQueryData(keys.task(task.id), task);
      patchBoard(client, projectId, (board) => upsertTaskInBoard(board, task));
      onTasksChanged(client, projectId);
    },
  });
}

export function useUpdateTask(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; changes: TaskUpdate }) =>
      tasksApi.update(input.taskId, input.changes),
    onSuccess: (task) => {
      client.setQueryData(keys.task(task.id), task);
      patchBoard(client, projectId, (board) => upsertTaskInBoard(board, task));
      onTasksChanged(client, projectId);
    },
  });
}

export function useDeleteTask(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId),
    onSuccess: (_result, taskId) => {
      patchBoard(client, projectId, (board) => removeTaskFromBoard(board, taskId));
      client.removeQueries({ queryKey: keys.task(taskId) });
      client.removeQueries({ queryKey: keys.comments(taskId) });
      onTasksChanged(client, projectId);
    },
  });
}

export interface MoveInput {
  taskId: string;
  status: TaskStatus;
  /** Tarefa imediatamente acima na coluna de destino; `null` = topo. */
  afterTaskId: string | null;
}

/**
 * Move uma tarefa (`POST /tasks/{id}/move`). O quadro é atualizado de forma otimista; se a
 * API recusar, o estado anterior é restaurado e o quadro é recarregado do servidor.
 */
export function useMoveTask(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MoveInput) =>
      tasksApi.move(input.taskId, {
        status: input.status,
        afterTaskId: input.afterTaskId,
      }),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: keys.board(projectId) });
      const previous = client.getQueryData<Board>(keys.board(projectId));
      patchBoard(client, projectId, (board) =>
        applyMoveToBoard(board, input.taskId, input.status, input.afterTaskId),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(keys.board(projectId), context.previous);
    },
    onSuccess: (task: Task) => {
      client.setQueryData(keys.task(task.id), task);
    },
    onSettled: () => {
      onTasksChanged(client, projectId);
    },
  });
}

// ---------- comentários ----------

export function useCreateComment(projectId: string, taskId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => commentsApi.create(taskId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.comments(taskId) });
      onTasksChanged(client, projectId); // contagem no cartão e histórico
      void client.invalidateQueries({ queryKey: keys.task(taskId) });
    },
  });
}

export function useUpdateComment(taskId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string; body: string }) =>
      commentsApi.update(input.commentId, input.body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.comments(taskId) });
    },
  });
}

export function useDeleteComment(projectId: string, taskId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => commentsApi.remove(commentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.comments(taskId) });
      onTasksChanged(client, projectId);
      void client.invalidateQueries({ queryKey: keys.task(taskId) });
    },
  });
}
