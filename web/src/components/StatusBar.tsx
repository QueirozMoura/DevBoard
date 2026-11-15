import type { TaskStatus } from '../api/types';
import { TASK_STATUSES } from '../api/types';
import { cn } from '../lib/cn';
import { STATUS_META } from '../lib/meta';

/**
 * Distribuição de tarefas por status em uma barra segmentada. A informação não depende só
 * de cor: cada segmento tem rótulo e contagem na legenda, e a barra tem descrição textual.
 */
export function StatusBar({ counts }: { counts: Record<TaskStatus, number> }) {
  const total = TASK_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const summary = TASK_STATUSES.map(
    (s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`,
  ).join(', ');
  return (
    <div>
      <div
        role="img"
        aria-label={total === 0 ? 'Nenhuma tarefa' : `Tarefas por status: ${summary}`}
        className="bg-ink-800 flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {total > 0
          ? TASK_STATUSES.filter((status) => counts[status] > 0).map((status) => (
              <div
                key={status}
                className={cn(
                  'h-full transition-[flex-grow] duration-500',
                  STATUS_META[status].bar,
                )}
                style={{ flexGrow: counts[status], flexBasis: 0 }}
              />
            ))
          : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <div key={status}>
            <dt className="text-fg-muted flex items-center gap-2 text-sm">
              <span
                className={cn('size-2 rounded-full', STATUS_META[status].dot)}
                aria-hidden
              />
              {STATUS_META[status].label}
            </dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums">
              {counts[status]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
