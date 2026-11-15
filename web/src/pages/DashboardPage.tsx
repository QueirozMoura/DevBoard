import { useQueries } from '@tanstack/react-query';
import { CalendarClock, FolderKanban, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import { tasksApi } from '../api/endpoints';
import type { Board, Project, Task, TaskStatus } from '../api/types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../api/types';
import { useCurrentUser } from '../auth/context';
import { StatusBar } from '../components/StatusBar';
import { PriorityBadge, RoleBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { cn } from '../lib/cn';
import { dueState, formatLongDate, formatShortDate, greeting } from '../lib/meta';
import { keys, useProjects } from '../queries';
import { Button } from '../components/ui/Button';

/** Quantos projetos entram nos números do painel (não há endpoint agregado no contrato). */
const DASHBOARD_PROJECTS = 6;

function emptyCounts(): Record<TaskStatus, number> {
  return { TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 };
}

export function countByStatus(boards: (Board | undefined)[]): Record<TaskStatus, number> {
  const counts = emptyCounts();
  for (const board of boards) {
    for (const column of board?.columns ?? []) counts[column.status] += column.total;
  }
  return counts;
}

/** Ordem de "o que fazer primeiro": prazo mais próximo e, no empate, maior prioridade. */
export function sortMyTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      const diff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (diff !== 0) return diff;
    } else if (a.dueDate || b.dueDate) {
      return a.dueDate ? -1 : 1;
    }
    return TASK_PRIORITIES.indexOf(b.priority) - TASK_PRIORITIES.indexOf(a.priority);
  });
}

export function DashboardPage() {
  const user = useCurrentUser();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const scoped = projects.slice(0, DASHBOARD_PROJECTS);

  const boards = useQueries({
    queries: scoped.map((project) => ({
      queryKey: keys.board(project.id, 1),
      queryFn: () => tasksApi.board(project.id, 1),
    })),
  });
  const mine = useQueries({
    queries: scoped.map((project) => ({
      queryKey: keys.myTasks(project.id, user.id),
      queryFn: () => tasksApi.list(project.id, { assigneeId: user.id, limit: 50 }),
    })),
  });

  const loading =
    projectsQuery.isPending ||
    boards.some((q) => q.isPending) ||
    mine.some((q) => q.isPending);
  const failure =
    projectsQuery.error ??
    boards.find((q) => q.error)?.error ??
    mine.find((q) => q.error)?.error;

  const counts = countByStatus(boards.map((q) => q.data));
  const totalTasks = TASK_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const doneByProject = new Map<string, number>(
    scoped.map((project, index) => [
      project.id,
      boards[index]?.data?.columns.find((c) => c.status === 'DONE')?.total ?? 0,
    ]),
  );
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const myOpen = sortMyTasks(
    mine.flatMap((q) => q.data?.items ?? []).filter((task) => task.status !== 'DONE'),
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
          <p className="text-fg-muted mt-1 text-sm first-letter:uppercase">
            {formatLongDate(new Date())}
          </p>
        </div>
      </header>

      {failure ? (
        <ErrorState
          error={failure}
          onRetry={() => {
            void projectsQuery.refetch();
            boards.forEach((q) => void q.refetch());
            mine.forEach((q) => void q.refetch());
          }}
        />
      ) : loading ? (
        <DashboardSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Você ainda não participa de nenhum projeto"
          description="Crie um projeto para organizar tarefas em colunas e convidar o time."
          action={
            <Link to="/projects">
              <Button>Ir para projetos</Button>
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-labelledby="overview"
            className="border-line bg-ink-900 rounded-[var(--radius-panel)] border p-5 sm:p-6"
          >
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="overview" className="text-base font-semibold">
                Visão geral das tarefas
              </h2>
              <p className="text-fg-muted text-sm">
                {totalTasks} {totalTasks === 1 ? 'tarefa' : 'tarefas'} em {scoped.length}{' '}
                {scoped.length === 1 ? 'projeto' : 'projetos'}
                {projects.length > scoped.length
                  ? ` (mais recentes de ${projects.length})`
                  : ''}
              </p>
            </div>
            <StatusBar counts={counts} />
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            <section aria-labelledby="mine">
              <h2 id="mine" className="mb-3 text-base font-semibold">
                Suas tarefas em aberto
              </h2>
              {myOpen.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="Nada atribuído a você"
                  description="Quando alguém atribuir uma tarefa a você, ela aparece aqui, ordenada por prazo."
                />
              ) : (
                <ul className="divide-line border-line bg-ink-900 divide-y rounded-[var(--radius-panel)] border">
                  {myOpen.slice(0, 8).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      projectName={projectName.get(task.projectId)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="projects">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="projects" className="text-base font-semibold">
                  Projetos
                </h2>
                <Link to="/projects" className="text-cobalt-300 text-sm hover:underline">
                  Ver todos
                </Link>
              </div>
              <ul className="space-y-3">
                {scoped.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    done={doneByProject.get(project.id) ?? 0}
                  />
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ task, projectName }: { task: Task; projectName: string | undefined }) {
  const due = dueState(task.dueDate, task.status);
  return (
    <li>
      <Link
        to={`/projects/${task.projectId}`}
        className="hover:bg-ink-850 flex items-center gap-4 px-4 py-3 transition-colors first:rounded-t-[var(--radius-panel)] last:rounded-b-[var(--radius-panel)]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="text-fg-muted truncate text-xs">{projectName ?? 'Projeto'}</p>
        </div>
        <PriorityBadge priority={task.priority} />
        <span
          className={cn(
            'flex w-20 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums',
            due === 'overdue'
              ? 'text-danger'
              : due === 'soon'
                ? 'text-st-review'
                : 'text-fg-muted',
          )}
        >
          {task.dueDate ? (
            <>
              <CalendarClock className="size-3.5" aria-hidden />
              <span>
                {formatShortDate(task.dueDate)}
                {due === 'overdue' ? <span className="sr-only"> (atrasada)</span> : null}
              </span>
            </>
          ) : (
            <span className="text-fg-faint">Sem prazo</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function ProjectRow({ project, done }: { project: Project; done: number }) {
  const percent =
    project.taskCount === 0 ? 0 : Math.round((done / project.taskCount) * 100);
  return (
    <li>
      <Link
        to={`/projects/${project.id}`}
        className="border-line bg-ink-900 hover:border-ink-700 hover:bg-ink-850 block rounded-[var(--radius-panel)] border p-4 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-medium">{project.name}</p>
          <RoleBadge role={project.myRole} />
        </div>
        <div
          role="progressbar"
          aria-label={`Progresso de ${project.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="bg-ink-800 mt-3 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-st-done h-full rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-fg-muted mt-2 text-xs">
          {done} de {project.taskCount} concluídas · {project.memberCount}{' '}
          {project.memberCount === 1 ? 'membro' : 'membros'}
        </p>
      </Link>
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando painel">
      <Skeleton className="h-44 rounded-[var(--radius-panel)]" />
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-72 rounded-[var(--radius-panel)]" />
        <Skeleton className="h-72 rounded-[var(--radius-panel)]" />
      </div>
    </div>
  );
}
