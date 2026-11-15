import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/states';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço não existe ou foi movido."
        action={
          <Link to="/">
            <Button>Ir para o painel</Button>
          </Link>
        }
      />
    </div>
  );
}
