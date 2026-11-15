import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { activitiesApi } from '../../api/endpoints';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';
import { describeActivity, timeAgo } from '../../lib/activity';
import { keys } from '../../queries';

interface Props {
  projectId: string;
  /** Com `taskId`, mostra só o histórico dessa tarefa. */
  taskId?: string;
  emptyText?: string;
}

const PAGE = 20;

export function ActivityList({ projectId, taskId, emptyText }: Props) {
  const query = useInfiniteQuery({
    queryKey: [...keys.activities(projectId, taskId), 'pages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      activitiesApi.list(projectId, { taskId, cursor: pageParam, limit: PAGE }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando atividades">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nada por aqui ainda"
        description={
          emptyText ?? 'As ações do projeto aparecem aqui, da mais recente à mais antiga.'
        }
      />
    );
  }

  return (
    <div>
      <ol className="space-y-4">
        {items.map((activity) => (
          <li key={activity.id} className="flex gap-3">
            <Avatar name={activity.actor?.name ?? '?'} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-pretty">{describeActivity(activity)}</p>
              <time dateTime={activity.createdAt} className="text-fg-faint text-xs">
                {timeAgo(activity.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-5"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
