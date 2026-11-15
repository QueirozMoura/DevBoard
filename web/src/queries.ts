import { useQuery } from '@tanstack/react-query';
import { projectsApi, tasksApi } from './api/endpoints';

/** Chaves de cache centralizadas para invalidar/atualizar de forma consistente. */
export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  board: (id: string, limit?: number) => ['board', id, limit ?? 'all'] as const,
  myTasks: (projectId: string, userId: string) =>
    ['tasks', projectId, 'mine', userId] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => projectsApi.list({ limit: 100 }),
  });
}

export { projectsApi, tasksApi };
