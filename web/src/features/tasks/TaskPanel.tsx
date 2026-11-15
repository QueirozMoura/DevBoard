import { Trash2 } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { describeError, isApiError } from '../../api/errors';
import type { Member, Role, Task, TaskStatus } from '../../api/types';
import { TASK_STATUSES } from '../../api/types';
import { useCurrentUser } from '../../auth/context';
import { Alert } from '../../components/ui/Alert';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, Skeleton } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { lastTaskIdOf, toColumns } from '../../lib/board';
import { fieldErrors, isFieldLevel } from '../../lib/formErrors';
import { STATUS_META } from '../../lib/meta';
import { can } from '../../lib/permissions';
import {
  type DraftErrors,
  draftFromTask,
  draftToUpdate,
  type TaskDraft,
  validateDraft,
} from '../../lib/taskDraft';
import { useDeleteTask, useMoveTask, useUpdateTask } from '../../mutations';
import { keys, useBoard, useTask } from '../../queries';
import { TaskFields } from './TaskFields';
import { useQueryClient } from '@tanstack/react-query';
import type { Board } from '../../api/types';

interface Props {
  projectId: string;
  role: Role;
  /** `null` = fechado. */
  taskId: string | null;
  members: Member[];
  onClose: () => void;
}

/** Painel lateral de detalhes: edição, mudança de coluna, exclusão. */
export function TaskPanel({ projectId, role, taskId, members, onClose }: Props) {
  const query = useTask(taskId);
  const title = query.data?.title ?? 'Detalhes da tarefa';
  return (
    <Modal open={taskId !== null} onClose={onClose} title={title} variant="panel">
      {query.isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando tarefa">
          <Skeleton className="h-10" />
          <Skeleton className="h-28" />
          <Skeleton className="h-10" />
        </div>
      ) : query.isError ? (
        isApiError(query.error, 'NOT_FOUND') ? (
          <ErrorState error={query.error} />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )
      ) : (
        <TaskDetails
          key={query.data.id}
          task={query.data}
          projectId={projectId}
          role={role}
          members={members}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function TaskDetails({
  task,
  projectId,
  role,
  members,
  onClose,
}: {
  task: Task;
  projectId: string;
  role: Role;
  members: Member[];
  onClose: () => void;
}) {
  const me = useCurrentUser();
  const toast = useToast();
  const client = useQueryClient();
  const board = useBoard(projectId);
  const update = useUpdateTask(projectId);
  const move = useMoveTask(projectId);
  const remove = useDeleteTask(projectId);
  // Só guardamos o que o usuário editou; o resto acompanha o servidor (ex.: após mover).
  const [edits, setEdits] = useState<Partial<TaskDraft>>({});
  const base = draftFromTask(task);
  const draft: TaskDraft = { ...base, ...edits };
  const [errors, setErrors] = useState<DraftErrors>({});
  const [deleting, setDeleting] = useState(false);
  const FIELDS = ['title', 'description', 'dueDate'] as const;

  const changes = draftToUpdate(draft, task);
  const dirty = Object.keys(changes).length > 0;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const local = validateDraft(draft);
    setErrors(local);
    if (Object.keys(local).length > 0 || !dirty) return;
    update.mutate(
      { taskId: task.id, changes },
      {
        onSuccess: () => {
          setEdits({});
          toast.success('Tarefa atualizada.');
        },
        onError: (error) => {
          setErrors(fieldErrors(error, FIELDS));
        },
      },
    );
  }

  function changeColumn(status: TaskStatus) {
    if (status === task.status) return;
    const boardData = client.getQueryData<Board>(keys.board(projectId)) ?? board.data;
    const afterTaskId = boardData
      ? lastTaskIdOf(toColumns(boardData), status, task.id)
      : null;
    move.mutate(
      { taskId: task.id, status, afterTaskId },
      {
        onSuccess: () => {
          toast.success(`Movida para ${STATUS_META[status].label}.`);
        },
        onError: (error) => {
          toast.error(describeError(error));
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={task.status} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Mover para</span>
          <select
            aria-label="Mover para a coluna"
            value={task.status}
            disabled={move.isPending}
            onChange={(event) => {
              changeColumn(event.target.value as TaskStatus);
            }}
            className="rounded-control border-ink-700 bg-ink-900 h-9 border px-2 text-sm"
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {update.isError && !isFieldLevel(update.error, FIELDS) ? (
          <Alert>{describeError(update.error)}</Alert>
        ) : null}
        <TaskFields
          draft={draft}
          onChange={(next) => {
            setEdits(diffDraft(next, base));
          }}
          errors={errors}
          members={members}
        />
        <div className="flex items-center justify-between gap-2">
          {can.deleteTask(role, task, me.id) ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={() => {
                remove.reset();
                setDeleting(true);
              }}
            >
              Excluir tarefa
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!dirty} loading={update.isPending}>
            Salvar alterações
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={deleting}
        title={`Excluir “${task.title}”?`}
        description={
          <p>A tarefa e seus comentários serão removidos. Não é possível desfazer.</p>
        }
        confirmLabel="Excluir tarefa"
        loading={remove.isPending}
        error={remove.isError ? describeError(remove.error) : null}
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          remove.mutate(task.id, {
            onSuccess: () => {
              toast.success('Tarefa excluída.');
              setDeleting(false);
              onClose();
            },
          });
        }}
      />
    </div>
  );
}

function diffDraft(next: TaskDraft, base: TaskDraft): Partial<TaskDraft> {
  const edits: Partial<TaskDraft> = {};
  for (const key of Object.keys(next) as (keyof TaskDraft)[]) {
    if (next[key] !== base[key]) (edits as Record<string, string>)[key] = next[key];
  }
  return edits;
}
