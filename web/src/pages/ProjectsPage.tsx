import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router';
import { RoleBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { useProjects } from '../queries';

/** Etapa 1: listagem somente leitura. Criar/editar projetos chega na etapa 2. */
export function ProjectsPage() {
  const query = useProjects();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
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
          title="Nenhum projeto por aqui"
          description="Os projetos dos quais você participa aparecem nesta lista."
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
                  {project.taskCount} tarefas · {project.memberCount} membros
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
