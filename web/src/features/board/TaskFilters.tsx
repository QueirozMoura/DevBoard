import { Search, X } from 'lucide-react';
import type { Member, TaskPriority } from '../../api/types';
import { TASK_PRIORITIES } from '../../api/types';
import { Button } from '../../components/ui/Button';
import {
  hasActiveFilters,
  NO_FILTERS,
  type TaskFilters as Filters,
} from '../../lib/board';
import { PRIORITY_META } from '../../lib/meta';

const selectClass =
  'rounded-control border-ink-700 bg-ink-900 hover:border-fg-faint/60 focus:border-cobalt-400 h-9 border px-2.5 text-sm outline-none';

export function TaskFilters({
  filters,
  members,
  onChange,
}: {
  filters: Filters;
  members: Member[];
  onChange: (next: Filters) => void;
}) {
  return (
    <form
      role="search"
      aria-label="Filtrar tarefas"
      onSubmit={(event) => {
        event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <span className="sr-only">Buscar por título</span>
        <Search
          className="text-fg-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={filters.q}
          placeholder="Buscar tarefas"
          onChange={(event) => {
            onChange({ ...filters, q: event.target.value });
          }}
          className={`${selectClass} placeholder:text-fg-faint w-full pl-9`}
        />
      </label>
      <label>
        <span className="sr-only">Prioridade</span>
        <select
          value={filters.priority}
          onChange={(event) => {
            onChange({ ...filters, priority: event.target.value as TaskPriority | '' });
          }}
          className={selectClass}
        >
          <option value="">Todas as prioridades</option>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Responsável</span>
        <select
          value={filters.assignee}
          onChange={(event) => {
            onChange({ ...filters, assignee: event.target.value });
          }}
          className={selectClass}
        >
          <option value="">Todos os responsáveis</option>
          <option value="unassigned">Sem responsável</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      {hasActiveFilters(filters) ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<X className="size-4" aria-hidden />}
          onClick={() => {
            onChange(NO_FILTERS);
          }}
        >
          Limpar filtros
        </Button>
      ) : null}
    </form>
  );
}
