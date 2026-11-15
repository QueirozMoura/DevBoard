import { FolderKanban, LayoutDashboard, UserRound } from 'lucide-react';
import { NavLink } from 'react-router';
import { Logo } from '../components/Logo';
import { cn } from '../lib/cn';
import { useProjects } from '../queries';
import { UserMenu } from './UserMenu';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-cobalt-500/15 text-cobalt-300'
      : 'text-fg-muted hover:bg-ink-800 hover:text-fg',
  );

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const projects = useProjects();
  const recent = projects.data?.items.slice(0, 6) ?? [];
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      <nav aria-label="Principal" className="space-y-1" onClick={onNavigate}>
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard className="size-4" aria-hidden /> Painel
        </NavLink>
        <NavLink to="/projects" end className={linkClass}>
          <FolderKanban className="size-4" aria-hidden /> Projetos
        </NavLink>
        <NavLink to="/profile" className={linkClass}>
          <UserRound className="size-4" aria-hidden /> Perfil
        </NavLink>
      </nav>
      <nav
        aria-label="Projetos recentes"
        className="min-h-0 flex-1 overflow-y-auto"
        onClick={onNavigate}
      >
        <h2 className="text-fg-faint px-3 pb-2 text-xs font-medium">Projetos recentes</h2>
        {recent.length === 0 ? (
          <p className="text-fg-faint px-3 text-sm">
            {projects.isPending ? 'Carregando…' : 'Nenhum projeto ainda.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((project) => (
              <li key={project.id}>
                <NavLink to={`/projects/${project.id}`} className={linkClass}>
                  <span
                    className="bg-cobalt-500/60 size-1.5 shrink-0 rounded-full"
                    aria-hidden
                  />
                  <span className="truncate">{project.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <div className="border-line border-t pt-3">
        <UserMenu />
      </div>
    </div>
  );
}
