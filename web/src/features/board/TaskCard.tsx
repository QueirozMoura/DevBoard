import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, GripVertical, MessageSquare } from 'lucide-react';
import type { Task } from '../../api/types';
import { Avatar } from '../../components/ui/Avatar';
import { PriorityBadge } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';
import { dueState, formatShortDate } from '../../lib/meta';

export function DueChip({ task }: { task: Pick<Task, 'dueDate' | 'status'> }) {
  if (!task.dueDate) return null;
  const state = dueState(task.dueDate, task.status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        state === 'overdue' && 'text-danger',
        state === 'soon' && 'text-st-review',
        state !== 'overdue' && state !== 'soon' && 'text-fg-muted',
      )}
    >
      <CalendarClock className="size-3.5" aria-hidden />
      {formatShortDate(task.dueDate)}
      {state === 'overdue' ? <span className="sr-only"> (atrasada)</span> : null}
    </span>
  );
}

/** Conteúdo visual do cartão (também usado na pré-visualização do arraste). */
export function TaskCardBody({
  task,
  assigneeName,
}: {
  task: Task;
  assigneeName: string | undefined;
}) {
  return (
    <>
      <p className="text-sm leading-snug font-medium text-pretty break-words">
        {task.title}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <PriorityBadge priority={task.priority} />
        <DueChip task={task} />
        {task.commentCount > 0 ? (
          <span className="text-fg-muted inline-flex items-center gap-1 text-xs tabular-nums">
            <MessageSquare className="size-3.5" aria-hidden />
            <span className="sr-only">Comentários: </span>
            {task.commentCount}
          </span>
        ) : null}
        <span className="ml-auto">
          {assigneeName ? (
            <Avatar name={assigneeName} size="sm" />
          ) : (
            <span className="sr-only">Sem responsável</span>
          )}
        </span>
      </div>
    </>
  );
}

interface SortableTaskCardProps {
  task: Task;
  assigneeName: string | undefined;
  /** Sem arraste (ex.: filtros ativos): o cartão continua abrindo os detalhes. */
  dragDisabled: boolean;
  onOpen: (taskId: string) => void;
}

/**
 * Cartão arrastável. A alça é um botão próprio (acessível por teclado: Espaço pega,
 * setas movem, Espaço solta, Esc cancela); o resto do cartão abre os detalhes.
 */
export function SortableTaskCard({
  task,
  assigneeName,
  dragDisabled,
  onOpen,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: dragDisabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group border-line bg-ink-850 hover:border-ink-700 relative rounded-lg border transition-colors',
        isDragging && 'opacity-40',
      )}
    >
      {dragDisabled ? null : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reordenar tarefa: ${task.title}`}
          className="text-fg-faint hover:text-fg absolute top-2 right-1.5 grid size-7 cursor-grab touch-none place-items-center rounded-md opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onOpen(task.id);
        }}
        className="block w-full rounded-lg p-3 pr-9 text-left"
      >
        <TaskCardBody task={task} assigneeName={assigneeName} />
      </button>
    </li>
  );
}
