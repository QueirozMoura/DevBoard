import type { Member, TaskPriority, TaskStatus } from '../../api/types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../api/types';
import { DateField, SelectField, TextareaField } from '../../components/ui/Field';
import { TextField } from '../../components/ui/TextField';
import { PRIORITY_META, STATUS_META } from '../../lib/meta';
import type { DraftErrors, TaskDraft } from '../../lib/taskDraft';

interface Props {
  draft: TaskDraft;
  onChange: (next: TaskDraft) => void;
  errors: DraftErrors;
  members: Member[];
  /** Mostra o campo de coluna (só na criação; depois, mover usa `/move`). */
  showStatus?: boolean;
  autoFocusTitle?: boolean;
}

/** Campos compartilhados entre o diálogo de nova tarefa e o painel de detalhes. */
export function TaskFields({
  draft,
  onChange,
  errors,
  members,
  showStatus = false,
  autoFocusTitle = false,
}: Props) {
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  return (
    <div className="space-y-4">
      <TextField
        label="Título"
        name="title"
        autoFocus={autoFocusTitle}
        maxLength={200}
        value={draft.title}
        error={errors.title}
        onChange={(event) => {
          set('title', event.target.value);
        }}
      />
      <TextareaField
        label="Descrição"
        name="description"
        value={draft.description}
        error={errors.description}
        onChange={(event) => {
          set('description', event.target.value);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {showStatus ? (
          <SelectField
            label="Coluna"
            name="status"
            value={draft.status}
            onChange={(event) => {
              set('status', event.target.value as TaskStatus);
            }}
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField
          label="Prioridade"
          name="priority"
          value={draft.priority}
          onChange={(event) => {
            set('priority', event.target.value as TaskPriority);
          }}
        >
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Responsável"
          name="assigneeId"
          value={draft.assigneeId}
          onChange={(event) => {
            set('assigneeId', event.target.value);
          }}
        >
          <option value="">Sem responsável</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </SelectField>
        <DateField
          label="Prazo"
          name="dueDate"
          value={draft.dueDate}
          error={errors.dueDate}
          onChange={(event) => {
            set('dueDate', event.target.value);
          }}
        />
      </div>
    </div>
  );
}
