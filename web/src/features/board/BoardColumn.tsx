import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { BoardColumn as ColumnData, Task } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { columnId } from '../../lib/board';
import { cn } from '../../lib/cn';
import { STATUS_META } from '../../lib/meta';
import { SortableTaskCard } from './TaskCard';

interface Props {
  column: ColumnData;
  /** Tarefas a exibir (já filtradas). */
  tasks: Task[];
  filtering: boolean;
  memberNames: Map<string, string>;
  loadingMore: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: () => void;
  onLoadMore: () => void;
}

export function BoardColumn({
  column,
  tasks,
  filtering,
  memberNames,
  loadingMore,
  onOpenTask,
  onAddTask,
  onLoadMore,
}: Props) {
  const meta = STATUS_META[column.status];
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column.status) });
  const headingId = `col-${column.status}`;

  return (
    <section
      aria-labelledby={headingId}
      className="border-line bg-ink-900/70 flex max-h-full min-h-48 w-[17.5rem] shrink-0 snap-start flex-col rounded-[var(--radius-panel)] border lg:w-auto lg:min-w-0 lg:shrink"
    >
      <header className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
          {meta.label}
          <span className="text-fg-muted font-normal tabular-nums">
            <span className="sr-only">, </span>
            {filtering ? `${tasks.length} de ${column.total}` : column.total}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-1.5 size-8 px-0"
          aria-label={`Adicionar tarefa em ${meta.label}`}
          onClick={onAddTask}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-b-[var(--radius-panel)] px-2.5 pb-2.5 transition-colors',
          isOver && 'bg-cobalt-500/5',
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="min-h-16 space-y-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                assigneeName={
                  task.assigneeId ? memberNames.get(task.assigneeId) : undefined
                }
                dragDisabled={filtering}
                onOpen={onOpenTask}
              />
            ))}
          </ul>
        </SortableContext>
        {tasks.length === 0 ? (
          <p className="text-fg-faint px-1 py-4 text-center text-sm">
            {filtering
              ? 'Nenhuma tarefa com esses filtros.'
              : 'Nenhuma tarefa aqui ainda.'}
          </p>
        ) : null}
        {column.hasMore ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            Carregar mais ({column.total - column.tasks.length})
          </Button>
        ) : null}
      </div>
    </section>
  );
}
