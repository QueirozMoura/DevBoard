import { createContext, useContext } from 'react';
import type { User } from '../api/types';

/** `unavailable`: a restauração falhou por motivo transitório (rede, 429, 5xx); o cookie pode estar válido. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Erro da última tentativa de restaurar a sessão (quando `unavailable`). */
  restoreError: unknown;
  /** Tenta restaurar a sessão de novo. */
  retryRestore: () => void;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return value;
}

/** Usuário autenticado garantido (use dentro de rotas protegidas). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser exige usuário autenticado');
  return user;
}
