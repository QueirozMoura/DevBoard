import type { Activity } from '../api/types';
import { ROLE_LABEL, STATUS_META } from './meta';

const FIELD_LABEL: Record<string, string> = {
  name: 'nome',
  description: 'descrição',
  title: 'título',
  priority: 'prioridade',
  assigneeId: 'responsável',
  dueDate: 'prazo',
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const named = (value: unknown): string => (str(value) ? `“${str(value)}”` : 'uma tarefa');
const taskRef = (value: unknown): string =>
  str(value) ? `a tarefa “${str(value)}”` : 'uma tarefa';
const label = (map: Record<string, { label: string }>, value: unknown): string =>
  map[str(value)]?.label.toLowerCase() ?? str(value);
const changes = (data: Record<string, unknown>): string => {
  const list = Array.isArray(data.changes) ? data.changes : [];
  const names = list.map((key) => FIELD_LABEL[str(key)] ?? str(key)).filter(Boolean);
  return names.length > 0 ? ` (${names.join(', ')})` : '';
};
const role = (value: unknown): string =>
  (ROLE_LABEL as Record<string, string | undefined>)[str(value)] ?? str(value);

/** Frase em português, sempre sujeita ao ator; funciona com `data` incompleto. */
export function describeActivity(activity: Activity): string {
  const who = activity.actor?.name ?? 'Alguém';
  const d = activity.data;
  switch (activity.type) {
    case 'PROJECT_CREATED':
      return `${who} criou o projeto`;
    case 'PROJECT_UPDATED':
      return `${who} editou o projeto${changes(d)}`;
    case 'MEMBER_ADDED':
      return `${who} adicionou ${str(d.name) || 'um membro'}${str(d.role) ? ` como ${role(d.role).toLowerCase()}` : ''}`;
    case 'MEMBER_ROLE_CHANGED':
      return `${who} mudou o papel de ${str(d.name) || 'um membro'} de ${role(d.from).toLowerCase()} para ${role(d.to).toLowerCase()}`;
    case 'MEMBER_REMOVED':
      return `${who} removeu ${str(d.name) || 'um membro'} do projeto`;
    case 'TASK_CREATED':
      return `${who} criou ${taskRef(d.title)}`;
    case 'TASK_UPDATED':
      return `${who} editou ${taskRef(d.title)}${changes(d)}`;
    case 'TASK_MOVED':
      return `${who} moveu ${named(d.title)} de ${label(STATUS_META, d.from)} para ${label(STATUS_META, d.to)}`;
    case 'TASK_DELETED':
      return `${who} excluiu ${taskRef(d.title)}`;
    case 'COMMENT_ADDED':
      return `${who} comentou em ${named(d.title)}`;
  }
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'agora';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 2_592_000) return relative.format(Math.round(seconds / 86_400), 'day');
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
