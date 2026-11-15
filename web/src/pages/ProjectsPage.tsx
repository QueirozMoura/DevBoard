import { FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ProjectFormDialog } from '../features/projects/ProjectFormDialog';
import { Button } from '../components/ui/Button';
import { RoleBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useProjects } from '../queries';

export function ProjectsPage() {
  const query = useProjects();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newProject = (
    <Button
      icon={<Plus className="size-4" aria-hidden />}
      onClick={() => {
        setCreating(true);
      }}
    >
      Novo projeto
    </Button>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
        {query.data && query.data.items.length > 0 ? newProject : null}
      </header>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-panel)]" />
          ))}
        </div>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Crie seu primeiro projeto"
          description="Um projeto reúne tarefas em um quadro e os membros do time que trabalham nele."
          action={newProject}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.items.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="border-line bg-ink-900 hover:border-ink-700 hover:bg-ink-850 flex h-full flex-col rounded-[var(--radius-panel)] border p-5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{project.name}</h2>
                  <RoleBadge role={project.myRole} />
                </div>
                <p className="text-fg-muted mt-2 line-clamp-2 flex-1 text-sm">
                  {project.description ?? 'Sem descrição.'}
                </p>
                <p className="text-fg-faint mt-4 text-xs">
                  {project.taskCount} {project.taskCount === 1 ? 'tarefa' : 'tarefas'} ·{' '}
                  {project.memberCount} {project.memberCount === 1 ? 'membro' : 'membros'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ProjectFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={(project) => {
          void navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
