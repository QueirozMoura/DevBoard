import { useQuery } from '@tanstack/react-query';
import { commentsApi, membersApi, projectsApi, tasksApi } from './api/endpoints';

/** Chaves de cache centralizadas; prefixos permitem invalidar por projeto/tarefa. */
export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  members: (id: string) => ['members', id] as const,
  board: (id: string, limit?: number) => ['board', id, limit ?? 'full'] as const,
  boardPrefix: (id: string) => ['board', id] as const,
  myTasks: (projectId: string, userId: string) =>
    ['tasks', projectId, 'mine', userId] as const,
  tasksPrefix: (projectId: string) => ['tasks', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  activities: (projectId: string, taskId?: string) =>
    ['activities', projectId, taskId ?? 'all'] as const,
  activitiesPrefix: (projectId: string) => ['activities', projectId] as const,
};

/** Quantas tarefas por coluna o quadro carrega de início (`GET …/board?limitPerColumn=`). */
export const BOARD_PAGE_SIZE = 50;

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => projectsApi.list({ limit: 100 }),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    retry: false,
  });
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: keys.members(projectId),
    queryFn: () => membersApi.list(projectId, { limit: 100 }),
  });
}

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: keys.board(projectId),
    queryFn: () => tasksApi.board(projectId, BOARD_PAGE_SIZE),
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: keys.task(taskId ?? ''),
    queryFn: () => tasksApi.get(taskId ?? ''),
    enabled: taskId !== null,
    retry: false,
  });
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: keys.comments(taskId),
    queryFn: () => commentsApi.list(taskId, { limit: 100 }),
  });
}
