/**
 * Tipos do contrato REST (openapi.json). Escritos à mão porque o gerador oficial
 * (openapi-typescript) ainda não suporta TypeScript 6; `contract.test.ts` compara as
 * chaves de `modelKeys` com o openapi.json para barrar divergências.
 */
export type Role = 'OWNER' | 'MEMBER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
];
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
];

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  /** @deprecated legado; o frontend não lê nem armazena. */
  refreshToken?: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  myRole: Role;
  memberCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  position: string;
  createdById: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  status: TaskStatus;
  tasks: Task[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface Board {
  columns: BoardColumn[];
}

export interface Comment {
  id: string;
  taskId: string;
  author: { id: string; name: string } | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'MEMBER_ADDED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_REMOVED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_MOVED'
  | 'TASK_DELETED'
  | 'COMMENT_ADDED';

export interface Activity {
  id: string;
  projectId: string;
  taskId: string | null;
  actor: { id: string; name: string } | null;
  type: ActivityType;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
}
export type ProjectUpdate = Partial<ProjectCreate>;

export interface TaskCreate {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
}
export interface TaskUpdate {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
}
export interface MemberAdd {
  email: string;
  role?: Role;
}
export interface CommentBody {
  body: string;
}
export interface TaskMove {
  status?: TaskStatus;
  afterTaskId: string | null;
}

/** Chaves exigidas por modelo; o compilador obriga a lista a espelhar a interface. */
type Keys<T> = { [K in keyof T]-?: true };
export const modelKeys = {
  User: { id: true, name: true, email: true, createdAt: true } satisfies Keys<User>,
  Project: {
    id: true,
    name: true,
    description: true,
    myRole: true,
    memberCount: true,
    taskCount: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Keys<Project>,
  Member: {
    userId: true,
    name: true,
    email: true,
    role: true,
    joinedAt: true,
  } satisfies Keys<Member>,
  Task: {
    id: true,
    projectId: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    assigneeId: true,
    dueDate: true,
    position: true,
    createdById: true,
    commentCount: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Keys<Task>,
  BoardColumn: {
    status: true,
    tasks: true,
    total: true,
    hasMore: true,
    nextCursor: true,
  } satisfies Keys<BoardColumn>,
  Comment: {
    id: true,
    taskId: true,
    author: true,
    body: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Keys<Comment>,
  Activity: {
    id: true,
    projectId: true,
    taskId: true,
    actor: true,
    type: true,
    data: true,
    createdAt: true,
  } satisfies Keys<Activity>,
} as const;
