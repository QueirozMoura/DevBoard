import type {
  Task,
  TaskCreate,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
} from '../api/types';

/** Estado do formulário de tarefa (tudo texto, como nos inputs). */
export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Id do responsável ou `''` (sem responsável). */
  assigneeId: string;
  /** `YYYY-MM-DD` ou `''` (sem prazo). */
  dueDate: string;
}

export const emptyDraft = (status: TaskStatus = 'TODO'): TaskDraft => ({
  title: '',
  description: '',
  status,
  priority: 'MEDIUM',
  assigneeId: '',
  dueDate: '',
});

/** O prazo é gravado ao meio-dia UTC para o dia não mudar com o fuso do navegador. */
export const dueToIso = (date: string): string => `${date}T12:00:00.000Z`;
export const isoToDue = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export const draftFromTask = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description ?? '',
  status: task.status,
  priority: task.priority,
  assigneeId: task.assigneeId ?? '',
  dueDate: isoToDue(task.dueDate),
});

export interface DraftErrors {
  title?: string;
  description?: string;
  dueDate?: string;
}

export function validateDraft(draft: TaskDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title.length < 1) errors.title = 'Informe o título da tarefa.';
  else if (title.length > 200) errors.title = 'Use no máximo 200 caracteres.';
  if (draft.description.trim().length > 10_000) {
    errors.description = 'Use no máximo 10.000 caracteres.';
  }
  if (draft.dueDate && Number.isNaN(Date.parse(dueToIso(draft.dueDate)))) {
    errors.dueDate = 'Informe uma data válida.';
  }
  return errors;
}

export function draftToCreate(draft: TaskDraft): TaskCreate {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    status: draft.status,
    priority: draft.priority,
    assigneeId: draft.assigneeId || null,
    dueDate: draft.dueDate ? dueToIso(draft.dueDate) : null,
  };
}

/** Somente os campos alterados (PATCH parcial; status/posição vão por `/move`). */
export function draftToUpdate(draft: TaskDraft, task: Task): TaskUpdate {
  const changes: TaskUpdate = {};
  if (draft.title.trim() !== task.title) changes.title = draft.title.trim();
  if ((draft.description.trim() || null) !== task.description) {
    changes.description = draft.description.trim() || null;
  }
  if (draft.priority !== task.priority) changes.priority = draft.priority;
  if ((draft.assigneeId || null) !== task.assigneeId)
    changes.assigneeId = draft.assigneeId || null;
  if (draft.dueDate !== isoToDue(task.dueDate)) {
    changes.dueDate = draft.dueDate ? dueToIso(draft.dueDate) : null;
  }
  return changes;
}
