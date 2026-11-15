import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';
import { describeError, isApiError } from '../api/errors';
import type { Project } from '../api/types';
import { Button } from '../components/ui/Button';
import { RoleBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useToast } from '../components/ui/Toast';
import { ProjectFormDialog } from '../features/projects/ProjectFormDialog';
import { cn } from '../lib/cn';
import { can } from '../lib/permissions';
import { useDeleteProject } from '../mutations';
import { useProject } from '../queries';
import { SearchX } from 'lucide-react';

export interface ProjectContext {
  project: Project;
}
export const useProjectContext = (): ProjectContext => useOutletContext<ProjectContext>();

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
    isActive
      ? 'border-cobalt-500 text-fg'
      : 'text-fg-muted hover:text-fg border-transparent',
  );

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const query = useProject(projectId);

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando projeto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-96 rounded-[var(--radius-panel)]" />
      </div>
    );
  }
  if (query.isError) {
    if (isApiError(query.error, 'NOT_FOUND')) {
      return (
        <div className="mx-auto max-w-lg py-12">
          <EmptyState
            icon={SearchX}
            title="Projeto não encontrado"
            description="Ele pode ter sido excluído ou você não participa dele."
            action={
              <Link to="/projects">
                <Button variant="secondary">Ver meus projetos</Button>
              </Link>
            }
          />
        </div>
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return <ProjectShell project={query.data} />;
}

function ProjectShell({ project }: { project: Project }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteProject(project.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/projects"
          className="text-fg-muted hover:text-fg mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Projetos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {project.name}
              </h1>
              <RoleBadge role={project.myRole} />
            </div>
            {project.description ? (
              <p className="text-fg-muted mt-1.5 max-w-2xl text-sm text-pretty">
                {project.description}
              </p>
            ) : null}
          </div>
          {can.editProject(project.myRole) ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil className="size-4" aria-hidden />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                Editar
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" aria-hidden />}
                onClick={() => {
                  remove.reset();
                  setDeleting(true);
                }}
              >
                Excluir
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <nav aria-label="Seções do projeto" className="border-line flex gap-6 border-b">
        <NavLink to={`/projects/${project.id}`} end className={tabClass}>
          Quadro
        </NavLink>
        <NavLink to={`/projects/${project.id}/members`} className={tabClass}>
          Membros{' '}
          <span className="text-fg-faint tabular-nums">{project.memberCount}</span>
        </NavLink>
        <NavLink to={`/projects/${project.id}/activity`} className={tabClass}>
          Atividade
        </NavLink>
      </nav>

      <Outlet context={{ project } satisfies ProjectContext} />

      <ProjectFormDialog
        open={editing}
        project={project}
        onClose={() => {
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={deleting}
        title={`Excluir “${project.name}”?`}
        description={
          <p>
            Isso remove o projeto com todas as {project.taskCount} tarefas, comentários e
            o histórico. <strong className="text-fg">Não é possível desfazer.</strong>
          </p>
        }
        confirmLabel="Excluir projeto"
        loading={remove.isPending}
        error={remove.isError ? describeError(remove.error) : null}
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={() => {
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('Projeto excluído.');
              void navigate('/projects', { replace: true });
            },
          });
        }}
      />
    </div>
  );
}
