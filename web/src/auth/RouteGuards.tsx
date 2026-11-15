import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingScreen } from '../components/ui/states';
import { useAuth } from './context';

/** Rotas privadas: aguarda a restauração da sessão e redireciona ao login se anônimo. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingScreen label="Restaurando sessão" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Telas de login/cadastro: usuário já autenticado vai direto ao painel. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingScreen label="Restaurando sessão" />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
