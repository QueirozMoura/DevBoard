import { type SyntheticEvent, useState } from 'react';
import { describeError } from '../../api/errors';
import type { Member, TaskStatus } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { fieldErrors, isFieldLevel } from '../../lib/formErrors';
import {
  type DraftErrors,
  draftToCreate,
  emptyDraft,
  validateDraft,
} from '../../lib/taskDraft';
import { useCreateTask } from '../../mutations';
import { TaskFields } from './TaskFields';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  status: TaskStatus;
  members: Member[];
}

export function TaskFormDialog({ open, onClose, projectId, status, members }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Nova tarefa" variant="lg">
      <TaskForm
        projectId={projectId}
        status={status}
        members={members}
        onClose={onClose}
      />
    </Modal>
  );
}

function TaskForm({ projectId, status, members, onClose }: Omit<Props, 'open'>) {
  const toast = useToast();
  const create = useCreateTask(projectId);
  const [draft, setDraft] = useState(() => emptyDraft(status));
  const [errors, setErrors] = useState<DraftErrors>({});
  const FIELDS = ['title', 'description', 'dueDate'] as const;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const local = validateDraft(draft);
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    create.mutate(draftToCreate(draft), {
      onSuccess: () => {
        toast.success('Tarefa criada.');
        onClose();
      },
      onError: (error) => {
        setErrors(fieldErrors(error, FIELDS));
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {create.isError && !isFieldLevel(create.error, FIELDS) ? (
        <Alert>{describeError(create.error)}</Alert>
      ) : null}
      <TaskFields
        draft={draft}
        onChange={setDraft}
        errors={errors}
        members={members}
        showStatus
        autoFocusTitle
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Criar tarefa
        </Button>
      </div>
    </form>
  );
}
