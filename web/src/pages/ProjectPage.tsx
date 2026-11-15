import { Kanban } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/states';

/** Placeholder da etapa 1: o quadro Kanban, os detalhes e os membros chegam na etapa 2. */
export function ProjectPage() {
  return (
    <EmptyState
      icon={Kanban}
      title="O quadro deste projeto chega na próxima etapa"
      description="Kanban, detalhes de tarefas, membros, comentários e histórico estão em desenvolvimento."
      action={
        <Link to="/projects">
          <Button variant="secondary">Voltar aos projetos</Button>
        </Link>
      }
    />
  );
}
