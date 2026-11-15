import { Navigate, Outlet, useLocation } from 'react-router';
import { describeError } from '../api/errors';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/Logo';
import { LoadingScreen } from '../components/ui/states';
import { useAuth } from './context';

/** A restauração falhou por motivo transitório: não desloga, oferece nova tentativa. */
function SessionUnavailable() {
  const { restoreError, retryRestore, logout } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div role="alert" className="max-w-sm space-y-5 text-center">
        <Logo className="justify-center" />
        <div>
          <h1 className="text-xl font-semibold">Não foi possível restaurar sua sessão</h1>
          <p className="text-fg-muted mt-2 text-sm text-pretty">
            {describeError(restoreError)}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={retryRestore}>Tentar novamente</Button>
          <Button variant="ghost" onClick={() => void logout()}>
            Entrar com outra conta
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Rotas privadas: aguarda a restauração da sessão e redireciona ao login se anônimo. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingScreen label="Restaurando sessão" />;
  if (status === 'unavailable') return <SessionUnavailable />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Telas de login/cadastro: usuário já autenticado vai direto ao painel. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingScreen label="Restaurando sessão" />;
  if (status === 'unavailable') return <SessionUnavailable />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
