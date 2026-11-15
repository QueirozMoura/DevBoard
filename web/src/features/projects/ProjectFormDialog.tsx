import { type SyntheticEvent, useState } from 'react';
import { describeError } from '../../api/errors';
import type { Project } from '../../api/types';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextareaField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { TextField } from '../../components/ui/TextField';
import { fieldErrors, isFieldLevel } from '../../lib/formErrors';
import { useCreateProject, useUpdateProject } from '../../mutations';
import { useToast } from '../../components/ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sem `project` o diálogo cria; com `project` edita. */
  project?: Project;
  onSaved?: (project: Project) => void;
}

export function ProjectFormDialog({ open, onClose, project, onSaved }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Editar projeto' : 'Novo projeto'}
      description={
        project ? undefined : 'Você será o proprietário e poderá convidar o time depois.'
      }
    >
      <ProjectForm project={project} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project: Project | undefined;
  onClose: () => void;
  onSaved: Props['onSaved'];
}) {
  const toast = useToast();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const mutation = project ? update : create;
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const local: typeof errors = {};
    if (name.trim().length < 1) local.name = 'Informe o nome do projeto.';
    else if (name.trim().length > 100) local.name = 'Use no máximo 100 caracteres.';
    if (description.trim().length > 2000)
      local.description = 'Use no máximo 2000 caracteres.';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    const body = { name: name.trim(), description: description.trim() || null };
    mutation.mutate(body, {
      onSuccess: (saved) => {
        toast.success(project ? 'Projeto atualizado.' : 'Projeto criado.');
        onSaved?.(saved);
        onClose();
      },
      onError: (error) => {
        setErrors(fieldErrors(error, ['name', 'description']));
      },
    });
  }

  const serverFieldErrors = mutation.isError
    ? fieldErrors(mutation.error, ['name', 'description'])
    : {};
  const showAlert =
    mutation.isError && !isFieldLevel(mutation.error, ['name', 'description']);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {showAlert ? <Alert>{describeError(mutation.error)}</Alert> : null}
      <TextField
        label="Nome"
        name="name"
        data-autofocus
        value={name}
        maxLength={100}
        error={errors.name ?? serverFieldErrors.name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <TextareaField
        label="Descrição"
        name="description"
        value={description}
        hint="Opcional. Até 2000 caracteres."
        error={errors.description ?? serverFieldErrors.description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {project ? 'Salvar alterações' : 'Criar projeto'}
        </Button>
      </div>
    </form>
  );
}
