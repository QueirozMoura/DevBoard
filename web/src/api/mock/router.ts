import { ApiError } from '../errors';
import {
  type Board,
  type Page,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../types';
import { groupOf, mockGroupEnabled } from './config';
import {
  getMockStore,
  type MockStore,
  type MockUser,
  nextId,
  resetMockStore,
} from './store';

export interface RawResponse {
  status: number;
  body: unknown;
  retryAfter: number | null;
}

let latencyMs = import.meta.env.MODE === 'test' ? 0 : 220;
export function setMockLatency(ms: number): void {
  latencyMs = ms;
}

/** Chamado pela camada de autenticação: o mock simula dados do usuário real logado. */
export function setMockUser(user: MockUser | null): void {
  const current = getMockStore();
  if (user && current?.me.id !== user.id) resetMockStore(user);
}

export function isMocked(path: string): boolean {
  const group = groupOf(path);
  return group !== null && mockGroupEnabled(group);
}

interface Context {
  store: MockStore;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}
type Handler = (context: Context) => { status: number; body: unknown };

const fail = (status: number, code: string): never => {
  throw new ApiError(status, code, code);
};

function viewProject(store: MockStore, id: string): Project {
  const record = store.projects.find((project) => project.id === id);
  const mine = record?.members.find((member) => member.userId === store.me.id);
  if (!record || !mine) return fail(404, 'NOT_FOUND');
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    myRole: mine.role,
    memberCount: record.members.length,
    taskCount: store.tasks.filter((task) => task.projectId === id).length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset })).replace(/=+$/, '');
}
function decodeCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: unknown };
    if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) {
      return parsed.o;
    }
  } catch {
    // cai no erro abaixo
  }
  return fail(400, 'INVALID_CURSOR');
}

function limitOf(
  query: URLSearchParams,
  fallback: number,
  max: number,
  name = 'limit',
): number {
  const raw = query.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return fail(400, 'VALIDATION_ERROR');
  }
  return value;
}

function paginate<T>(rows: T[], query: URLSearchParams): Page<T> {
  const limit = limitOf(query, 20, 100);
  const start = decodeCursor(query.get('cursor'));
  const items = rows.slice(start, start + limit);
  return {
    items,
    nextCursor: start + limit < rows.length ? encodeCursor(start + limit) : null,
  };
}

const byPosition = (a: Task, b: Task): number =>
  TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
  (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) ||
  (a.id < b.id ? -1 : 1);

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects$/,
    handler: ({ store, query }) => {
      const views = store.projects
        .filter((project) => project.members.some((m) => m.userId === store.me.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((project) => viewProject(store, project.id));
      return { status: 200, body: paginate(views, query) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/projects$/,
    handler: ({ store, body }) => {
      const input = (body ?? {}) as { name?: unknown; description?: unknown };
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const description =
        typeof input.description === 'string' ? input.description.trim() : null;
      if (name.length < 1 || name.length > 100 || (description?.length ?? 0) > 2000) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', [
          { path: 'name', message: 'Informe um nome de 1 a 100 caracteres' },
        ]);
      }
      const now = new Date().toISOString();
      const id = nextId();
      store.projects.push({
        id,
        name,
        description: description === '' ? null : description,
        createdAt: now,
        updatedAt: now,
        members: [
          {
            userId: store.me.id,
            name: store.me.name,
            email: store.me.email,
            role: 'OWNER',
            joinedAt: now,
          },
        ],
      });
      return { status: 201, body: viewProject(store, id) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<projectId>[^/]+)$/,
    handler: ({ store, params }) => ({
      status: 200,
      body: viewProject(store, params.projectId ?? ''),
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<projectId>[^/]+)\/board$/,
    handler: ({ store, params, query }) => {
      const projectId = params.projectId ?? '';
      viewProject(store, projectId);
      const limit = limitOf(query, 50, 200, 'limitPerColumn');
      const board: Board = {
        columns: TASK_STATUSES.map((status) => {
          const all = store.tasks
            .filter((task) => task.projectId === projectId && task.status === status)
            .sort(byPosition);
          return {
            status,
            tasks: all.slice(0, limit),
            total: all.length,
            hasMore: all.length > limit,
            nextCursor: all.length > limit ? encodeCursor(limit) : null,
          };
        }),
      };
      return { status: 200, body: board };
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<projectId>[^/]+)\/tasks$/,
    handler: ({ store, params, query }) => {
      const projectId = params.projectId ?? '';
      viewProject(store, projectId);
      const status = query.get('status');
      const priority = query.get('priority');
      if (status !== null && !TASK_STATUSES.includes(status as TaskStatus)) {
        return fail(400, 'VALIDATION_ERROR');
      }
      if (priority !== null && !TASK_PRIORITIES.includes(priority as TaskPriority)) {
        return fail(400, 'VALIDATION_ERROR');
      }
      const assignee = query.get('assigneeId');
      const text = query.get('q')?.trim().toLowerCase();
      const rows = store.tasks
        .filter((task) => task.projectId === projectId)
        .filter((task) => status === null || task.status === status)
        .filter((task) => priority === null || task.priority === priority)
        .filter((task) => assignee === null || task.assigneeId === assignee)
        .filter((task) => query.get('unassigned') !== 'true' || task.assigneeId === null)
        .filter((task) => !text || task.title.toLowerCase().includes(text))
        .sort(byPosition);
      return { status: 200, body: paginate(rows, query) };
    },
  },
];

export async function handleMock(
  method: string,
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<RawResponse> {
  if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const store = getMockStore();
  if (!store)
    return {
      status: 401,
      body: { error: 'UNAUTHORIZED', message: '' },
      retryAfter: null,
    };

  const [path = '', search = ''] = url.split('?');
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (route.method !== method || !match) continue;
    try {
      const result = route.handler({
        store,
        params: match.groups ?? {},
        query: new URLSearchParams(search),
        body,
      });
      return { ...result, retryAfter: null };
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          status: error.status,
          body: { error: error.code, message: error.message, details: error.details },
          retryAfter: null,
        };
      }
      throw error;
    }
  }
  return {
    status: 501,
    body: {
      error: 'INTERNAL_ERROR',
      message: `Mock não implementado: ${method} ${path}`,
    },
    retryAfter: null,
  };
}
