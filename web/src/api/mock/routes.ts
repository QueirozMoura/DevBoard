import { ApiError, type FieldIssue } from '../errors';
import {
  type Activity,
  type ActivityType,
  type Board,
  type Comment,
  type Member,
  type Page,
  type Project,
  type Role,
  type Task,
  type TaskPriority,
  type TaskStatus,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../types';
import { type MockStore, nextId, positionFor } from './store';

export interface Context {
  store: MockStore;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}
export type Handler = (context: Context) => { status: number; body: unknown };
export interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const fail = (status: number, code: string, details: FieldIssue[] = []): never => {
  throw new ApiError(status, code, code, details);
};
const invalid = (...fields: [string, string][]): never =>
  fail(
    400,
    'VALIDATION_ERROR',
    fields.map(([path, message]) => ({ path, message })),
  );

// ---------- helpers de domínio ----------

type StoredProject = MockStore['projects'][number];

function projectFor(store: MockStore, id: string | undefined): StoredProject {
  const found = store.projects.find((project) => project.id === id);
  if (!found?.members.some((member) => member.userId === store.me.id)) {
    return fail(404, 'NOT_FOUND');
  }
  return found;
}
const roleOf = (store: MockStore, project: StoredProject): Role =>
  project.members.find((member) => member.userId === store.me.id)?.role ?? 'MEMBER';

function requireOwner(store: MockStore, project: StoredProject): void {
  if (roleOf(store, project) !== 'OWNER') fail(403, 'FORBIDDEN');
}

function viewProject(store: MockStore, project: StoredProject): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    myRole: roleOf(store, project),
    memberCount: project.members.length,
    taskCount: store.tasks.filter((task) => task.projectId === project.id).length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function taskFor(store: MockStore, id: string | undefined) {
  const task = store.tasks.find((candidate) => candidate.id === id);
  if (!task) return fail(404, 'NOT_FOUND');
  return { task, project: projectFor(store, task.projectId) };
}

const byPosition = (a: Task, b: Task): number =>
  TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
  (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) ||
  (a.id < b.id ? -1 : 1);

function column(store: MockStore, projectId: string, status: TaskStatus): Task[] {
  return store.tasks
    .filter((task) => task.projectId === projectId && task.status === status)
    .sort(byPosition);
}
/** Posições são opacas: após cada alteração a coluna é renumerada em ordem. */
function renumber(tasks: Task[]): void {
  tasks.forEach((task, index) => {
    task.position = positionFor(index);
  });
}

function record(
  store: MockStore,
  project: StoredProject,
  type: ActivityType,
  data: Record<string, unknown>,
  taskId: string | null = null,
): void {
  project.updatedAt = new Date().toISOString();
  store.activities.push({
    id: nextId(),
    projectId: project.id,
    taskId,
    actor: { id: store.me.id, name: store.me.name },
    type,
    data,
    createdAt: new Date().toISOString(),
  });
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
function limitOf(query: URLSearchParams, fallback: number, max: number, name = 'limit') {
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
  return {
    items: rows.slice(start, start + limit),
    nextCursor: start + limit < rows.length ? encodeCursor(start + limit) : null,
  };
}

// ---------- validação estrita de corpos (contrato: campos extras = 400) ----------

type Shape = Record<string, (value: unknown) => string | undefined>;

function parseBody(
  body: unknown,
  shape: Shape,
  required: string[] = [],
  minOne = false,
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return invalid(['', 'Corpo inválido']);
  }
  const input = body as Record<string, unknown>;
  const issues: [string, string][] = [];
  for (const key of Object.keys(input)) {
    if (!(key in shape)) issues.push([key, 'Campo não permitido']);
  }
  for (const key of required) {
    if (input[key] === undefined) issues.push([key, 'Campo obrigatório']);
  }
  for (const [key, check] of Object.entries(shape)) {
    if (input[key] === undefined) continue;
    const problem = check(input[key]);
    if (problem) issues.push([key, problem]);
  }
  if (minOne && Object.keys(input).length === 0)
    issues.push(['', 'Informe ao menos um campo']);
  if (issues.length > 0) invalid(...issues);
  return input;
}

const text =
  (min: number, max: number, nullable = false) =>
  (value: unknown): string | undefined => {
    if (value === null) return nullable ? undefined : 'Não pode ser nulo';
    if (typeof value !== 'string') return 'Deve ser texto';
    const length = value.trim().length;
    if (length < min) return min === 1 ? 'Obrigatório' : `Mínimo de ${min} caracteres`;
    if (length > max) return `Máximo de ${max} caracteres`;
    return undefined;
  };
const oneOf =
  (options: readonly string[]) =>
  (value: unknown): string | undefined =>
    typeof value === 'string' && options.includes(value) ? undefined : 'Valor inválido';
const uuidOrNull = (value: unknown): string | undefined =>
  value === null || (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
    ? undefined
    : 'Identificador inválido';
const dateOrNull = (value: unknown): string | undefined =>
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    ? undefined
    : 'Data inválida';
const trimmed = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim() : null;
const emptyToNull = (value: unknown): string | null => {
  const result = trimmed(value);
  return result === '' ? null : result;
};

function assertAssignee(project: StoredProject, assigneeId: unknown): void {
  if (
    typeof assigneeId === 'string' &&
    !project.members.some((m) => m.userId === assigneeId)
  ) {
    fail(422, 'INVALID_ASSIGNEE');
  }
}

// ---------- rotas ----------

export const routes: Route[] = [
  // Projetos
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects$/,
    handler: ({ store, query }) => {
      const views = store.projects
        .filter((project) => project.members.some((m) => m.userId === store.me.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((project) => viewProject(store, project));
      return { status: 200, body: paginate(views, query) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/projects$/,
    handler: ({ store, body }) => {
      const input = parseBody(
        body,
        { name: text(1, 100), description: text(0, 2000, true) },
        ['name'],
      );
      const now = new Date().toISOString();
      const project: StoredProject = {
        id: nextId(),
        name: trimmed(input.name) ?? '',
        description: emptyToNull(input.description),
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
      };
      store.projects.push(project);
      record(store, project, 'PROJECT_CREATED', {});
      return { status: 201, body: viewProject(store, project) };
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)$/,
    handler: ({ store, params }) => ({
      status: 200,
      body: viewProject(store, projectFor(store, params.id)),
    }),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)$/,
    handler: ({ store, params, body }) => {
      const project = projectFor(store, params.id);
      requireOwner(store, project);
      const input = parseBody(
        body,
        { name: text(1, 100), description: text(0, 2000, true) },
        [],
        true,
      );
      if (input.name !== undefined) project.name = trimmed(input.name) ?? project.name;
      if (input.description !== undefined)
        project.description = emptyToNull(input.description);
      record(store, project, 'PROJECT_UPDATED', { changes: Object.keys(input) });
      return { status: 200, body: viewProject(store, project) };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)$/,
    handler: ({ store, params }) => {
      const project = projectFor(store, params.id);
      requireOwner(store, project);
      const taskIds = new Set(
        store.tasks
          .filter((task) => task.projectId === project.id)
          .map((task) => task.id),
      );
      store.projects = store.projects.filter((candidate) => candidate.id !== project.id);
      store.tasks = store.tasks.filter((task) => !taskIds.has(task.id));
      store.comments = store.comments.filter((comment) => !taskIds.has(comment.taskId));
      store.activities = store.activities.filter((a) => a.projectId !== project.id);
      return { status: 204, body: undefined };
    },
  },

  // Membros
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/members$/,
    handler: ({ store, params, query }) => {
      const project = projectFor(store, params.id);
      const rows = [...project.members].sort((a, b) =>
        a.joinedAt < b.joinedAt
          ? -1
          : a.joinedAt > b.joinedAt
            ? 1
            : a.userId < b.userId
              ? -1
              : 1,
      );
      return { status: 200, body: paginate<Member>(rows, query) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/members$/,
    handler: ({ store, params, body }) => {
      const project = projectFor(store, params.id);
      requireOwner(store, project);
      const input = parseBody(
        body,
        {
          email: (value) =>
            typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
              ? undefined
              : 'E-mail inválido',
          role: oneOf(['OWNER', 'MEMBER']),
        },
        ['email'],
      );
      const email = (trimmed(input.email) ?? '').toLowerCase();
      const person = store.people.find(
        (candidate) => candidate.email.toLowerCase() === email,
      );
      if (!person) return fail(404, 'INVITEE_NOT_FOUND');
      if (project.members.some((member) => member.userId === person.id)) {
        return fail(409, 'ALREADY_MEMBER');
      }
      const member: Member = {
        userId: person.id,
        name: person.name,
        email: person.email,
        role: (input.role as Role | undefined) ?? 'MEMBER',
        joinedAt: new Date().toISOString(),
      };
      project.members.push(member);
      record(store, project, 'MEMBER_ADDED', {
        userId: member.userId,
        name: member.name,
        role: member.role,
      });
      return { status: 201, body: member };
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/members\/(?<userId>[^/]+)$/,
    handler: ({ store, params, body }) => {
      const project = projectFor(store, params.id);
      requireOwner(store, project);
      const input = parseBody(body, { role: oneOf(['OWNER', 'MEMBER']) }, ['role']);
      const member = project.members.find((m) => m.userId === params.userId);
      if (!member) return fail(404, 'NOT_FOUND');
      const owners = project.members.filter((m) => m.role === 'OWNER').length;
      if (member.role === 'OWNER' && input.role === 'MEMBER' && owners === 1) {
        return fail(409, 'LAST_OWNER');
      }
      if (member.role !== input.role) {
        record(store, project, 'MEMBER_ROLE_CHANGED', {
          userId: member.userId,
          name: member.name,
          from: member.role,
          to: input.role,
        });
        member.role = input.role as Role;
      }
      return { status: 200, body: member };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/members\/(?<userId>[^/]+)$/,
    handler: ({ store, params }) => {
      const project = projectFor(store, params.id);
      const member = project.members.find((m) => m.userId === params.userId);
      if (!member) return fail(404, 'NOT_FOUND');
      const self = member.userId === store.me.id;
      if (!self && roleOf(store, project) !== 'OWNER') return fail(403, 'FORBIDDEN');
      const owners = project.members.filter((m) => m.role === 'OWNER').length;
      if (member.role === 'OWNER' && owners === 1) return fail(409, 'LAST_OWNER');
      project.members = project.members.filter((m) => m.userId !== member.userId);
      store.tasks.forEach((task) => {
        if (task.projectId === project.id && task.assigneeId === member.userId) {
          task.assigneeId = null;
        }
      });
      if (!self) {
        record(store, project, 'MEMBER_REMOVED', {
          userId: member.userId,
          name: member.name,
          role: member.role,
        });
      }
      return { status: 204, body: undefined };
    },
  },

  // Quadro e tarefas
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/board$/,
    handler: ({ store, params, query }) => {
      const project = projectFor(store, params.id);
      const limit = limitOf(query, 50, 200, 'limitPerColumn');
      const board: Board = {
        columns: TASK_STATUSES.map((status) => {
          const all = column(store, project.id, status);
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
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/tasks$/,
    handler: ({ store, params, query }) => {
      const project = projectFor(store, params.id);
      const status = query.get('status');
      const priority = query.get('priority');
      if (status !== null && !TASK_STATUSES.includes(status as TaskStatus)) {
        return fail(400, 'VALIDATION_ERROR');
      }
      if (priority !== null && !TASK_PRIORITIES.includes(priority as TaskPriority)) {
        return fail(400, 'VALIDATION_ERROR');
      }
      const assignee = query.get('assigneeId');
      const search = query.get('q')?.trim().toLowerCase();
      const rows = store.tasks
        .filter((task) => task.projectId === project.id)
        .filter((task) => status === null || task.status === status)
        .filter((task) => priority === null || task.priority === priority)
        .filter((task) => assignee === null || task.assigneeId === assignee)
        .filter((task) => query.get('unassigned') !== 'true' || task.assigneeId === null)
        .filter((task) => !search || task.title.toLowerCase().includes(search))
        .sort(byPosition);
      return { status: 200, body: paginate(rows, query) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/tasks$/,
    handler: ({ store, params, body }) => {
      const project = projectFor(store, params.id);
      const input = parseBody(
        body,
        {
          title: text(1, 200),
          description: text(0, 10_000, true),
          status: oneOf(TASK_STATUSES),
          priority: oneOf(TASK_PRIORITIES),
          assigneeId: uuidOrNull,
          dueDate: dateOrNull,
        },
        ['title'],
      );
      assertAssignee(project, input.assigneeId);
      const status = (input.status as TaskStatus | undefined) ?? 'TODO';
      const siblings = column(store, project.id, status);
      const now = new Date().toISOString();
      const task: Task = {
        id: nextId(),
        projectId: project.id,
        title: trimmed(input.title) ?? '',
        description: emptyToNull(input.description),
        status,
        priority: (input.priority as TaskPriority | undefined) ?? 'MEDIUM',
        assigneeId: (input.assigneeId as string | null | undefined) ?? null,
        dueDate: (input.dueDate as string | null | undefined) ?? null,
        position: positionFor(siblings.length),
        createdById: store.me.id,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      store.tasks.push(task);
      record(store, project, 'TASK_CREATED', { title: task.title }, task.id);
      return { status: 201, body: task };
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)$/,
    handler: ({ store, params }) => ({
      status: 200,
      body: taskFor(store, params.id).task,
    }),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)$/,
    handler: ({ store, params, body }) => {
      const { task, project } = taskFor(store, params.id);
      const input = parseBody(
        body,
        {
          title: text(1, 200),
          description: text(0, 10_000, true),
          priority: oneOf(TASK_PRIORITIES),
          assigneeId: uuidOrNull,
          dueDate: dateOrNull,
        },
        [],
        true,
      );
      assertAssignee(project, input.assigneeId);
      if (input.title !== undefined) task.title = trimmed(input.title) ?? task.title;
      if (input.description !== undefined)
        task.description = emptyToNull(input.description);
      if (input.priority !== undefined) task.priority = input.priority as TaskPriority;
      if (input.assigneeId !== undefined)
        task.assigneeId = input.assigneeId as string | null;
      if (input.dueDate !== undefined) task.dueDate = input.dueDate as string | null;
      task.updatedAt = new Date().toISOString();
      record(
        store,
        project,
        'TASK_UPDATED',
        { title: task.title, changes: Object.keys(input) },
        task.id,
      );
      return { status: 200, body: task };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)$/,
    handler: ({ store, params }) => {
      const { task, project } = taskFor(store, params.id);
      if (task.createdById !== store.me.id && roleOf(store, project) !== 'OWNER') {
        return fail(403, 'FORBIDDEN');
      }
      store.tasks = store.tasks.filter((candidate) => candidate.id !== task.id);
      store.comments = store.comments.filter((comment) => comment.taskId !== task.id);
      // O histórico é preservado, mas sem vínculo com a tarefa excluída.
      store.activities.forEach((activity) => {
        if (activity.taskId === task.id) activity.taskId = null;
      });
      record(store, project, 'TASK_DELETED', { title: task.title });
      return { status: 204, body: undefined };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)\/move$/,
    handler: ({ store, params, body }) => {
      const { task, project } = taskFor(store, params.id);
      const input = parseBody(
        body,
        { status: oneOf(TASK_STATUSES), afterTaskId: uuidOrNull },
        ['afterTaskId'],
      );
      const target = (input.status as TaskStatus | undefined) ?? task.status;
      const after = input.afterTaskId as string | null;
      const siblings = column(store, project.id, target).filter((t) => t.id !== task.id);
      let index = 0;
      if (after !== null) {
        const position = siblings.findIndex((candidate) => candidate.id === after);
        if (position === -1) return fail(422, 'INVALID_MOVE_TARGET');
        index = position + 1;
      }
      const from = task.status;
      siblings.splice(index, 0, task);
      task.status = target;
      task.updatedAt = new Date().toISOString();
      renumber(siblings);
      if (from !== target) {
        record(
          store,
          project,
          'TASK_MOVED',
          { title: task.title, from, to: target },
          task.id,
        );
      } else {
        project.updatedAt = new Date().toISOString();
      }
      return { status: 200, body: task };
    },
  },

  // Comentários
  {
    method: 'GET',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)\/comments$/,
    handler: ({ store, params, query }) => {
      const { task } = taskFor(store, params.id);
      const rows = store.comments
        .filter((comment) => comment.taskId === task.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      return { status: 200, body: paginate<Comment>(rows, query) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/tasks\/(?<id>[^/]+)\/comments$/,
    handler: ({ store, params, body }) => {
      const { task, project } = taskFor(store, params.id);
      const input = parseBody(body, { body: text(1, 5000) }, ['body']);
      const now = new Date().toISOString();
      const comment: Comment = {
        id: nextId(),
        taskId: task.id,
        author: { id: store.me.id, name: store.me.name },
        body: trimmed(input.body) ?? '',
        createdAt: now,
        updatedAt: now,
      };
      store.comments.push(comment);
      task.commentCount += 1;
      record(
        store,
        project,
        'COMMENT_ADDED',
        { title: task.title, commentId: comment.id },
        task.id,
      );
      return { status: 201, body: comment };
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/v1\/comments\/(?<id>[^/]+)$/,
    handler: ({ store, params, body }) => {
      const comment = store.comments.find((c) => c.id === params.id);
      if (!comment) return fail(404, 'NOT_FOUND');
      taskFor(store, comment.taskId);
      if (comment.author?.id !== store.me.id) return fail(403, 'FORBIDDEN');
      const input = parseBody(body, { body: text(1, 5000) }, ['body']);
      comment.body = trimmed(input.body) ?? comment.body;
      comment.updatedAt = new Date().toISOString();
      return { status: 200, body: comment };
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/v1\/comments\/(?<id>[^/]+)$/,
    handler: ({ store, params }) => {
      const comment = store.comments.find((c) => c.id === params.id);
      if (!comment) return fail(404, 'NOT_FOUND');
      const { task, project } = taskFor(store, comment.taskId);
      if (comment.author?.id !== store.me.id && roleOf(store, project) !== 'OWNER') {
        return fail(403, 'FORBIDDEN');
      }
      store.comments = store.comments.filter((c) => c.id !== comment.id);
      task.commentCount = Math.max(0, task.commentCount - 1);
      return { status: 204, body: undefined };
    },
  },

  // Atividades
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/(?<id>[^/]+)\/activities$/,
    handler: ({ store, params, query }) => {
      const project = projectFor(store, params.id);
      const taskId = query.get('taskId');
      const type = query.get('type');
      const rows = store.activities
        .filter((activity) => activity.projectId === project.id)
        .filter((activity) => taskId === null || activity.taskId === taskId)
        .filter((activity) => type === null || activity.type === type)
        .sort((a, b) =>
          a.createdAt === b.createdAt
            ? a.id < b.id
              ? 1
              : -1
            : a.createdAt < b.createdAt
              ? 1
              : -1,
        );
      return { status: 200, body: paginate<Activity>(rows, query) };
    },
  },
];
