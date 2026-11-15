import { arrayMove } from '@dnd-kit/sortable';
import {
  type Board,
  type Page,
  type Task,
  type TaskPriority,
  type TaskStatus,
  TASK_STATUSES,
} from '../api/types';

export type Columns = Record<TaskStatus, Task[]>;

/** Id do "soltar aqui" de cada coluna (útil para colunas vazias). */
export const COLUMN_PREFIX = 'column:';
export const columnId = (status: TaskStatus): string => `${COLUMN_PREFIX}${status}`;
export const statusFromColumnId = (id: string): TaskStatus | null => {
  if (!id.startsWith(COLUMN_PREFIX)) return null;
  const status = id.slice(COLUMN_PREFIX.length);
  return TASK_STATUSES.find((candidate) => candidate === status) ?? null;
};

export function toColumns(board: Board): Columns {
  const columns: Columns = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
  for (const column of board.columns) columns[column.status] = [...column.tasks];
  return columns;
}

export function findStatus(columns: Columns, taskId: string): TaskStatus | null {
  return (
    TASK_STATUSES.find((status) => columns[status].some((t) => t.id === taskId)) ?? null
  );
}

/** Tarefa imediatamente acima na coluna atual (`null` = topo): o `afterTaskId` do contrato. */
export function afterTaskIdOf(columns: Columns, taskId: string): string | null {
  const status = findStatus(columns, taskId);
  if (!status) return null;
  const index = columns[status].findIndex((task) => task.id === taskId);
  return index > 0 ? (columns[status][index - 1]?.id ?? null) : null;
}

/** `afterTaskId` para mandar a tarefa ao FIM de uma coluna (id da última tarefa dela). */
export function lastTaskIdOf(
  columns: Columns,
  status: TaskStatus,
  ignoreId?: string,
): string | null {
  const tasks = columns[status].filter((task) => task.id !== ignoreId);
  return tasks[tasks.length - 1]?.id ?? null;
}

/**
 * Prévia do arraste (padrão multi-container do dnd-kit): devolve novas colunas com o
 * cartão ativo na posição sobre `overId` (outro cartão ou o "soltar aqui" de uma coluna).
 */
export function previewMove(
  columns: Columns,
  activeId: string,
  overId: string,
  below = false,
): Columns {
  const from = findStatus(columns, activeId);
  const overStatus = statusFromColumnId(overId);
  const to = overStatus ?? findStatus(columns, overId);
  if (!from || !to) return columns;
  const active = columns[from].find((task) => task.id === activeId);
  if (!active) return columns;

  if (from === to) {
    const items = columns[from];
    const oldIndex = items.findIndex((task) => task.id === activeId);
    const newIndex = overStatus
      ? items.length - 1
      : items.findIndex((t) => t.id === overId);
    if (oldIndex === newIndex || newIndex < 0) return columns;
    return { ...columns, [from]: arrayMove(items, oldIndex, newIndex) };
  }

  const source = columns[from].filter((task) => task.id !== activeId);
  const target = [...columns[to]];
  const overIndex = overStatus
    ? target.length
    : target.findIndex((task) => task.id === overId);
  const index =
    overIndex < 0 ? target.length : overIndex + (below && !overStatus ? 1 : 0);
  target.splice(index, 0, { ...active, status: to });
  return { ...columns, [from]: source, [to]: target };
}

/** Atualização otimista do cache do quadro após mover uma tarefa. */
export function applyMoveToBoard(
  board: Board,
  taskId: string,
  status: TaskStatus,
  afterTaskId: string | null,
): Board {
  const columns = toColumns(board);
  const from = findStatus(columns, taskId);
  if (!from) return board;
  const moving = columns[from].find((task) => task.id === taskId);
  if (!moving) return board;
  columns[from] = columns[from].filter((task) => task.id !== taskId);
  const target = columns[status];
  const afterIndex =
    afterTaskId === null ? -1 : target.findIndex((t) => t.id === afterTaskId);
  target.splice(afterIndex + 1, 0, { ...moving, status });
  return {
    columns: board.columns.map((column) => ({
      ...column,
      tasks: columns[column.status],
      total:
        from === status
          ? column.total
          : column.total +
            (column.status === status ? 1 : 0) -
            (column.status === from ? 1 : 0),
    })),
  };
}

/** Insere ou substitui uma tarefa no quadro (criação/edição); respeita o status dela. */
export function upsertTaskInBoard(board: Board, task: Task): Board {
  const existing = board.columns.some((c) => c.tasks.some((t) => t.id === task.id));
  return {
    columns: board.columns.map((column) => {
      const without = column.tasks.filter((t) => t.id !== task.id);
      if (column.status !== task.status) {
        const removed = without.length !== column.tasks.length;
        return { ...column, tasks: without, total: column.total - (removed ? 1 : 0) };
      }
      const replaced = column.tasks.map((t) => (t.id === task.id ? task : t));
      return existing && column.tasks.some((t) => t.id === task.id)
        ? { ...column, tasks: replaced }
        : { ...column, tasks: [...without, task], total: column.total + 1 };
    }),
  };
}

export function removeTaskFromBoard(board: Board, taskId: string): Board {
  return {
    columns: board.columns.map((column) => {
      const tasks = column.tasks.filter((t) => t.id !== taskId);
      return {
        ...column,
        tasks,
        total: column.total - (tasks.length === column.tasks.length ? 0 : 1),
      };
    }),
  };
}

export interface TaskFilters {
  q: string;
  priority: TaskPriority | '';
  /** `''` = todos, `'unassigned'` = sem responsável, ou id de um membro. */
  assignee: string;
}
export const NO_FILTERS: TaskFilters = { q: '', priority: '', assignee: '' };

export const hasActiveFilters = (filters: TaskFilters): boolean =>
  filters.q.trim() !== '' || filters.priority !== '' || filters.assignee !== '';

export function matchesFilters(task: Task, filters: TaskFilters): boolean {
  const text = filters.q.trim().toLowerCase();
  if (text && !task.title.toLowerCase().includes(text)) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.assignee === 'unassigned') return task.assigneeId === null;
  if (filters.assignee && task.assigneeId !== filters.assignee) return false;
  return true;
}

/** Acrescenta à coluna a próxima página (`GET …/tasks?status=&cursor=`), sem duplicar. */
export function appendToColumn(
  board: Board,
  status: TaskStatus,
  page: Page<Task>,
): Board {
  return {
    columns: board.columns.map((column) => {
      if (column.status !== status) return column;
      const known = new Set(column.tasks.map((task) => task.id));
      const fresh = page.items.filter((task) => !known.has(task.id));
      return {
        ...column,
        tasks: [...column.tasks, ...fresh],
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      };
    }),
  };
}

export interface DropResult {
  status: TaskStatus;
  afterTaskId: string | null;
}

/**
 * O que persistir ao soltar: coluna final e a tarefa imediatamente acima (`afterTaskId`).
 * Devolve `null` quando a tarefa foi solta onde já estava (nada a salvar).
 */
export function dropResult(
  original: Columns,
  result: Columns,
  taskId: string,
): DropResult | null {
  const status = findStatus(result, taskId);
  if (!status) return null;
  const afterTaskId = afterTaskIdOf(result, taskId);
  if (
    status === findStatus(original, taskId) &&
    afterTaskId === afterTaskIdOf(original, taskId)
  ) {
    return null;
  }
  return { status, afterTaskId };
}
