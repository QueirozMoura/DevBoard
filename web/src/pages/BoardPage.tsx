import {
  type Announcements,
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { ListTodo, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { tasksApi } from '../api/endpoints';
import { describeError } from '../api/errors';
import { type Board, type Task, type TaskStatus, TASK_STATUSES } from '../api/types';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useToast } from '../components/ui/Toast';
import { BoardColumn } from '../features/board/BoardColumn';
import { TaskCardBody } from '../features/board/TaskCard';
import { TaskFilters } from '../features/board/TaskFilters';
import { TaskFormDialog } from '../features/tasks/TaskFormDialog';
import { TaskPanel } from '../features/tasks/TaskPanel';
import {
  appendToColumn,
  type Columns,
  dropResult,
  findStatus,
  hasActiveFilters,
  matchesFilters,
  NO_FILTERS,
  previewMove,
  toColumns,
} from '../lib/board';
import { STATUS_META } from '../lib/meta';
import { useMoveTask } from '../mutations';
import { keys, useBoard, useMembers } from '../queries';
import { useProjectContext } from './ProjectLayout';

const EMPTY_MEMBERS: never[] = [];

/** "coluna A fazer, posição 2 de 5": base dos avisos para leitores de tela. */
function describePlacement(columns: Columns, taskId: string): string {
  const status = findStatus(columns, taskId);
  if (!status) return '';
  const index = columns[status].findIndex((task) => task.id === taskId);
  return `coluna ${STATUS_META[status].label}, posição ${index + 1} de ${columns[status].length}`;
}

export function BoardPage() {
  const { project } = useProjectContext();
  const board = useBoard(project.id);
  const members = useMembers(project.id);
  const client = useQueryClient();
  const toast = useToast();
  const move = useMoveTask(project.id);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [loadingMore, setLoadingMore] = useState<TaskStatus | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const memberList = members.data?.items ?? EMPTY_MEMBERS;
  const memberNames = useMemo(
    () => new Map(memberList.map((member) => [member.userId, member.name])),
    [memberList],
  );
  const serverColumns = useMemo(
    () => (board.data ? toColumns(board.data) : null),
    [board.data],
  );
  const columns = dragColumns ?? serverColumns;
  const filtering = hasActiveFilters(filters);
  const openTaskId = params.get('task');

  const setOpenTask = (taskId: string | null) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (taskId) next.set('task', taskId);
        else next.delete('task');
        return next;
      },
      { replace: taskId === null },
    );
  };

  if (board.isPending) {
    return (
      <div
        className="grid gap-4 lg:grid-cols-4"
        aria-busy="true"
        aria-label="Carregando quadro"
      >
        {TASK_STATUSES.map((status) => (
          <Skeleton key={status} className="h-72 rounded-[var(--radius-panel)]" />
        ))}
      </div>
    );
  }
  if (board.isError) {
    return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  }
  if (!columns) return null;

  const total = board.data.columns.reduce((sum, column) => sum + column.total, 0);
  const activeTask: Task | undefined = activeId
    ? Object.values(columns)
        .flat()
        .find((task) => task.id === activeId)
    : undefined;

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const current = dragColumns ?? columns;
      return `Tarefa pega. ${describePlacement(current, String(active.id))}.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      const preview = previewMove(
        dragColumns ?? columns,
        String(active.id),
        String(over.id),
      );
      return `Tarefa movida para ${describePlacement(preview, String(active.id))}.`;
    },
    onDragEnd: ({ active, over }) => {
      const current = dragColumns ?? columns;
      return over
        ? `Tarefa solta em ${describePlacement(current, String(active.id))}.`
        : 'Tarefa solta sem mudança de posição.';
    },
    onDragCancel: () => 'Movimento cancelado. A tarefa voltou à posição original.',
  };

  const isBelow = (event: DragOverEvent | DragEndEvent): boolean => {
    const translated = event.active.rect.current.translated;
    return (
      !!event.over &&
      !!translated &&
      translated.top > event.over.rect.top + event.over.rect.height / 2
    );
  };

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragColumns(columns);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !dragColumns) return;
    setDragColumns(
      previewMove(dragColumns, String(active.id), String(over.id), isBelow(event)),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const taskId = String(active.id);
    const original = serverColumns;
    let result = dragColumns;
    if (over && result)
      result = previewMove(result, taskId, String(over.id), isBelow(event));
    setActiveId(null);
    setDragColumns(null);
    if (!over || !result || !original) return;

    const drop = dropResult(original, result, taskId);
    if (!drop) return; // soltou onde estava
    move.mutate(
      { taskId, ...drop },
      {
        onError: (error) => {
          toast.error(describeError(error));
        },
      },
    );
  }

  async function loadMore(status: TaskStatus) {
    const column = board.data?.columns.find((candidate) => candidate.status === status);
    if (!column?.nextCursor) return;
    setLoadingMore(status);
    try {
      const page = await tasksApi.list(project.id, {
        status,
        cursor: column.nextCursor,
        limit: 50,
      });
      client.setQueryData<Board>(keys.board(project.id), (current) =>
        current ? appendToColumn(current, status, page) : current,
      );
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setLoadingMore(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskFilters filters={filters} members={memberList} onChange={setFilters} />
        <Button
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => {
            setCreatingIn('TODO');
          }}
        >
          Nova tarefa
        </Button>
      </div>

      {filtering ? (
        <p role="status" className="text-fg-muted text-sm">
          Reordenar fica desativado enquanto há filtros. Use o painel da tarefa para mudar
          a coluna.
        </p>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nenhuma tarefa neste projeto"
          description="Crie a primeira tarefa e arraste os cartões entre as colunas conforme o trabalho avança."
          action={
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => {
                setCreatingIn('TODO');
              }}
            >
              Criar primeira tarefa
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Para pegar uma tarefa, pressione Espaço ou Enter. Use as setas para escolher a posição ou outra coluna, Espaço ou Enter para soltar e Esc para cancelar.',
            },
          }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setDragColumns(null);
          }}
        >
          <div className="relative -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
            {board.data.columns.map((column) => {
              const visible = columns[column.status].filter((task) =>
                matchesFilters(task, filters),
              );
              return (
                <BoardColumn
                  key={column.status}
                  column={{ ...column, total: column.total }}
                  tasks={visible}
                  filtering={filtering}
                  memberNames={memberNames}
                  loadingMore={loadingMore === column.status}
                  onOpenTask={setOpenTask}
                  onAddTask={() => {
                    setCreatingIn(column.status);
                  }}
                  onLoadMore={() => void loadMore(column.status)}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="border-cobalt-500/60 bg-ink-850 w-[17rem] rotate-1 rounded-lg border p-3 shadow-2xl shadow-black/50">
                <TaskCardBody
                  task={activeTask}
                  assigneeName={
                    activeTask.assigneeId
                      ? memberNames.get(activeTask.assigneeId)
                      : undefined
                  }
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskFormDialog
        open={creatingIn !== null}
        onClose={() => {
          setCreatingIn(null);
        }}
        projectId={project.id}
        status={creatingIn ?? 'TODO'}
        members={memberList}
      />
      <TaskPanel
        projectId={project.id}
        role={project.myRole}
        taskId={openTaskId}
        members={memberList}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}
