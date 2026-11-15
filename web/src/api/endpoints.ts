import { request } from './http';
import type {
  Activity,
  ActivityType,
  Board,
  Comment,
  Member,
  MemberAdd,
  Role,
  TaskCreate,
  TaskMove,
  TaskUpdate,
  LoginResponse,
  Page,
  Project,
  ProjectCreate,
  ProjectUpdate,
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

/** Projetos — API real (mocks opcionais para testes e demonstração). */
export const projectsApi = {
  list: (paging: Paging = {}) =>
    request<Page<Project>>(`${V1}/projects`, { query: { ...paging } }),
  get: (projectId: string) => request<Project>(`${V1}/projects/${projectId}`),
  create: (input: ProjectCreate) =>
    request<Project>(`${V1}/projects`, { method: 'POST', body: input }),
  update: (projectId: string, input: ProjectUpdate) =>
    request<Project>(`${V1}/projects/${projectId}`, { method: 'PATCH', body: input }),
  remove: (projectId: string) =>
    request<undefined>(`${V1}/projects/${projectId}`, { method: 'DELETE' }),
};

/** Membros — API real. */
export const membersApi = {
  list: (projectId: string, paging: Paging = {}) =>
    request<Page<Member>>(`${V1}/projects/${projectId}/members`, {
      query: { ...paging },
    }),
  add: (projectId: string, input: MemberAdd) =>
    request<Member>(`${V1}/projects/${projectId}/members`, {
      method: 'POST',
      body: input,
    }),
  setRole: (projectId: string, userId: string, role: Role) =>
    request<Member>(`${V1}/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),
  remove: (projectId: string, userId: string) =>
    request<undefined>(`${V1}/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    }),
};

export interface TaskFilters extends Paging {
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: string | undefined;
  unassigned?: boolean | undefined;
  q?: string | undefined;
}

/** Tarefas e quadro — API real. */
export const tasksApi = {
  board: (projectId: string, limitPerColumn?: number) =>
    request<Board>(`${V1}/projects/${projectId}/board`, { query: { limitPerColumn } }),
  list: (projectId: string, filters: TaskFilters = {}) =>
    request<Page<Task>>(`${V1}/projects/${projectId}/tasks`, { query: { ...filters } }),
  get: (taskId: string) => request<Task>(`${V1}/tasks/${taskId}`),
  create: (projectId: string, input: TaskCreate) =>
    request<Task>(`${V1}/projects/${projectId}/tasks`, { method: 'POST', body: input }),
  update: (taskId: string, input: TaskUpdate) =>
    request<Task>(`${V1}/tasks/${taskId}`, { method: 'PATCH', body: input }),
  remove: (taskId: string) =>
    request<undefined>(`${V1}/tasks/${taskId}`, { method: 'DELETE' }),
  move: (taskId: string, input: TaskMove) =>
    request<Task>(`${V1}/tasks/${taskId}/move`, { method: 'POST', body: input }),
};

/** Comentários — API real. */
export const commentsApi = {
  list: (taskId: string, paging: Paging = {}) =>
    request<Page<Comment>>(`${V1}/tasks/${taskId}/comments`, { query: { ...paging } }),
  create: (taskId: string, body: string) =>
    request<Comment>(`${V1}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: { body },
    }),
  update: (commentId: string, body: string) =>
    request<Comment>(`${V1}/comments/${commentId}`, { method: 'PATCH', body: { body } }),
  remove: (commentId: string) =>
    request<undefined>(`${V1}/comments/${commentId}`, { method: 'DELETE' }),
};

export interface ActivityFilters extends Paging {
  taskId?: string | undefined;
  type?: ActivityType | undefined;
}

/** Atividades — API real. */
export const activitiesApi = {
  list: (projectId: string, filters: ActivityFilters = {}) =>
    request<Page<Activity>>(`${V1}/projects/${projectId}/activities`, {
      query: { ...filters },
    }),
};
