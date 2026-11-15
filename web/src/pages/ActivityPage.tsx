import { ActivityList } from '../features/activity/ActivityList';
import { useProjectContext } from './ProjectLayout';

export function ActivityPage() {
  const { project } = useProjectContext();
  return (
    <section aria-labelledby="activity-title" className="max-w-2xl">
      <h2 id="activity-title" className="mb-4 text-base font-semibold">
        Histórico do projeto
      </h2>
      <ActivityList projectId={project.id} />
    </section>
  );
}
