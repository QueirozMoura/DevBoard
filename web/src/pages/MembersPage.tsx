import { LogOut, UserMinus, UserPlus } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { describeError, isApiError } from '../api/errors';
import type { Member, Role } from '../api/types';
import { useCurrentUser } from '../auth/context';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SelectField } from '../components/ui/Field';
import { ErrorState, Skeleton } from '../components/ui/states';
import { TextField } from '../components/ui/TextField';
import { useToast } from '../components/ui/Toast';
import { RoleBadge } from '../components/ui/Badge';
import { can } from '../lib/permissions';
import { useAddMember, useRemoveMember, useSetMemberRole } from '../mutations';
import { useMembers } from '../queries';
import { useProjectContext } from './ProjectLayout';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersPage() {
  const { project } = useProjectContext();
  const me = useCurrentUser();
  const toast = useToast();
  const navigate = useNavigate();
  const members = useMembers(project.id);
  const setRole = useSetMemberRole(project.id);
  const removeMember = useRemoveMember(project.id);
  const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null);
  const isOwner = can.manageMembers(project.myRole);

  if (members.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando membros">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[var(--radius-panel)]" />
        ))}
      </div>
    );
  }
  if (members.isError) {
    return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;
  }

  const leaving = pendingRemoval?.userId === me.id;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="members-title">
        <h2 id="members-title" className="mb-3 text-base font-semibold">
          Membros do projeto
        </h2>
        <ul className="divide-line border-line bg-ink-900 divide-y rounded-[var(--radius-panel)] border">
          {members.data.items.map((member) => {
            const isSelf = member.userId === me.id;
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.name}
                    {isSelf ? (
                      <span className="text-fg-faint font-normal"> (você)</span>
                    ) : null}
                  </p>
                  <p className="text-fg-muted truncate text-xs">{member.email}</p>
                </div>
                {isOwner ? (
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Papel de {member.name}</span>
                    <select
                      value={member.role}
                      disabled={setRole.isPending}
                      onChange={(event) => {
                        setRole.mutate(
                          { userId: member.userId, role: event.target.value as Role },
                          {
                            onSuccess: () => {
                              toast.success(`Papel de ${member.name} atualizado.`);
                            },
                            onError: (error) => {
                              toast.error(describeError(error));
                            },
                          },
                        );
                      }}
                      className="rounded-control border-ink-700 bg-ink-900 h-9 border px-2 text-sm"
                    >
                      <option value="OWNER">Proprietário</option>
                      <option value="MEMBER">Membro</option>
                    </select>
                  </label>
                ) : (
                  <RoleBadge role={member.role} />
                )}
                {can.removeMember(project.myRole, isSelf) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={isSelf ? 'Sair do projeto' : `Remover ${member.name}`}
                    icon={
                      isSelf ? (
                        <LogOut className="size-4" aria-hidden />
                      ) : (
                        <UserMinus className="size-4" aria-hidden />
                      )
                    }
                    onClick={() => {
                      removeMember.reset();
                      setPendingRemoval(member);
                    }}
                  >
                    {isSelf ? 'Sair' : 'Remover'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!isOwner ? (
          <p className="text-fg-muted mt-3 text-sm">
            Só proprietários podem convidar pessoas ou mudar papéis.
          </p>
        ) : null}
      </section>

      {isOwner ? <AddMemberForm projectId={project.id} /> : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={leaving ? 'Sair deste projeto?' : `Remover ${pendingRemoval?.name ?? ''}?`}
        description={
          leaving ? (
            <p>
              Você perde o acesso a “{project.name}”. Alguém precisa convidar você de novo
              para voltar.
            </p>
          ) : (
            <p>
              {pendingRemoval?.name} perde o acesso ao projeto e as tarefas atribuídas a
              essa pessoa ficam sem responsável.
            </p>
          )
        }
        confirmLabel={leaving ? 'Sair do projeto' : 'Remover membro'}
        loading={removeMember.isPending}
        error={removeMember.isError ? describeError(removeMember.error) : null}
        onCancel={() => {
          setPendingRemoval(null);
        }}
        onConfirm={() => {
          if (!pendingRemoval) return;
          removeMember.mutate(pendingRemoval.userId, {
            onSuccess: () => {
              setPendingRemoval(null);
              if (leaving) {
                toast.success('Você saiu do projeto.');
                void navigate('/projects', { replace: true });
              } else {
                toast.success('Membro removido.');
              }
            },
          });
        }}
      />
    </div>
  );
}

function AddMemberForm({ projectId }: { projectId: string }) {
  const toast = useToast();
  const add = useAddMember(projectId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const text = email.trim();
    if (!EMAIL.test(text)) {
      setError('Informe um e-mail válido.');
      return;
    }
    setError(undefined);
    add.mutate(
      { email: text, role },
      {
        onSuccess: (member) => {
          toast.success(`${member.name} entrou no projeto.`);
          setEmail('');
        },
        onError: (failure) => {
          if (
            isApiError(failure, 'INVITEE_NOT_FOUND') ||
            isApiError(failure, 'ALREADY_MEMBER') ||
            isApiError(failure, 'VALIDATION_ERROR')
          ) {
            setError(describeError(failure));
          }
        },
      },
    );
  }

  const generic =
    add.isError &&
    !isApiError(add.error, 'INVITEE_NOT_FOUND') &&
    !isApiError(add.error, 'ALREADY_MEMBER') &&
    !isApiError(add.error, 'VALIDATION_ERROR');

  return (
    <section aria-labelledby="add-title" className="lg:pt-0">
      <h2 id="add-title" className="mb-3 text-base font-semibold">
        Adicionar pessoa
      </h2>
      <form
        onSubmit={onSubmit}
        noValidate
        className="border-line bg-ink-900 space-y-4 rounded-[var(--radius-panel)] border p-4"
      >
        {generic ? <Alert>{describeError(add.error)}</Alert> : null}
        <TextField
          label="E-mail"
          type="email"
          name="email"
          autoComplete="off"
          value={email}
          error={error}
          hint="A pessoa precisa ter uma conta no DevBoard."
          onChange={(event) => {
            setEmail(event.target.value);
            setError(undefined);
          }}
        />
        <SelectField
          label="Papel"
          name="role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as Role);
          }}
        >
          <option value="MEMBER">Membro</option>
          <option value="OWNER">Proprietário</option>
        </SelectField>
        <Button
          type="submit"
          loading={add.isPending}
          className="w-full"
          icon={<UserPlus className="size-4" aria-hidden />}
        >
          Adicionar ao projeto
        </Button>
      </form>
    </section>
  );
}
