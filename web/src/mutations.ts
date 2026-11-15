import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { membersApi, projectsApi } from './api/endpoints';
import type { ProjectCreate, ProjectUpdate, Role } from './api/types';
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
