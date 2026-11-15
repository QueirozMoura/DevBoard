import type { Role, TaskPriority, TaskStatus } from '../api/types';

export const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; text: string; bar: string }
> = {
  TODO: { label: 'A fazer', dot: 'bg-st-todo', text: 'text-st-todo', bar: 'bg-st-todo' },
  IN_PROGRESS: {
    label: 'Em andamento',
    dot: 'bg-st-progress',
    text: 'text-cobalt-300',
    bar: 'bg-st-progress',
  },
  IN_REVIEW: {
    label: 'Em revisão',
    dot: 'bg-st-review',
    text: 'text-st-review',
    bar: 'bg-st-review',
  },
  DONE: {
    label: 'Concluída',
    dot: 'bg-st-done',
    text: 'text-st-done',
    bar: 'bg-st-done',
  },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  LOW: { label: 'Baixa', className: 'text-fg-muted bg-ink-800' },
  MEDIUM: { label: 'Média', className: 'text-cobalt-300 bg-cobalt-500/15' },
  HIGH: { label: 'Alta', className: 'text-st-review bg-st-review/15' },
  URGENT: { label: 'Urgente', className: 'text-danger bg-danger/15' },
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Proprietário',
  MEMBER: 'Membro',
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const fullDateFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export const formatShortDate = (iso: string): string =>
  dateFormat.format(new Date(iso)).replace('.', '');
export const formatLongDate = (date: Date): string => fullDateFormat.format(date);

/** Situação do prazo de uma tarefa, para destacar atrasos sem depender só de cor. */
export function dueState(
  dueDate: string | null,
  status: TaskStatus,
  now = Date.now(),
): 'none' | 'overdue' | 'soon' | 'later' | 'done' {
  if (!dueDate) return 'none';
  if (status === 'DONE') return 'done';
  const diff = new Date(dueDate).getTime() - now;
  if (diff < 0) return 'overdue';
  return diff < 3 * 86_400_000 ? 'soon' : 'later';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
