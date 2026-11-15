import { request } from './http';
import type {
  Board,
  LoginResponse,
  Page,
  Project,
  ProjectCreate,
  Task,
  TaskPriority,
  TaskStatus,
  User,
} from './types';

const V1 = '/api/v1';

/** Autenticação — REAL (x-status: implemented). */
export const authApi = {
  register: (input: { name: string; email: string; password: string }) =>
    request<User>(`${V1}/auth/register`, { method: 'POST', body: input, auth: false }),
  login: (input: { email: string; password: string }) =>
    request<LoginResponse>(`${V1}/auth/login`, {
      method: 'POST',
      body: input,
      auth: false,
      cookies: true,
    }),
  logout: () =>
    request<undefined>(`${V1}/auth/logout`, {
      method: 'POST',
      body: {},
      auth: false,
      cookies: true,
    }),
};

/** Perfil — REAL. */
export const usersApi = {
  me: () => request<User>(`${V1}/me`),
  updateMe: (input: { name?: string; email?: string }) =>
    request<User>(`${V1}/me`, { method: 'PATCH', body: input }),
};

export interface Paging {
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** Projetos — MOCK até o backend publicar (x-status: planned). */
export const projectsApi = {
  list: (paging: Paging = {}) =>
    request<Page<Project>>(`${V1}/projects`, { query: { ...paging } }),
  get: (projectId: string) => request<Project>(`${V1}/projects/${projectId}`),
  create: (input: ProjectCreate) =>
    request<Project>(`${V1}/projects`, { method: 'POST', body: input }),
};

export interface TaskFilters extends Paging {
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: string | undefined;
  unassigned?: boolean | undefined;
  q?: string | undefined;
}

/** Tarefas e quadro — MOCK (planned). */
export const tasksApi = {
  board: (projectId: string, limitPerColumn?: number) =>
    request<Board>(`${V1}/projects/${projectId}/board`, { query: { limitPerColumn } }),
  list: (projectId: string, filters: TaskFilters = {}) =>
    request<Page<Task>>(`${V1}/projects/${projectId}/tasks`, { query: { ...filters } }),
};
