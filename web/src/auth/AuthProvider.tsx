import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { refreshSession } from '../api/http';
import { setMockUser } from '../api/mock/router';
import { authApi, usersApi } from '../api/endpoints';
import { onSessionExpired, tokenStore } from '../api/tokenStore';
import type { User } from '../api/types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<User | null>(null);

  const adopt = useCallback((next: User) => {
    setMockUser(next);
    setUserState(next);
    setStatus('authenticated');
  }, []);

  const drop = useCallback(() => {
    tokenStore.clear();
    setUserState(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restaura a sessão pelo cookie HttpOnly de refresh (o JS nunca vê esse token).
  useEffect(() => {
    const run = { cancelled: false };
    void (async () => {
      try {
        await refreshSession();
        const me = await usersApi.me();
        if (!run.cancelled) adopt(me);
      } catch {
        if (!run.cancelled) drop();
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [adopt, drop]);

  // Falha definitiva de refresh em qualquer requisição → volta ao login.
  useEffect(() => onSessionExpired(drop), [drop]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      const result = await authApi.login(input);
      tokenStore.set(result.accessToken);
      queryClient.clear();
      adopt(result.user);
    },
    [adopt, queryClient],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (input) => {
      await authApi.register(input);
      await login({ email: input.email, password: input.password });
    },
    [login],
  );

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    try {
      await authApi.logout();
    } catch {
      // O estado local é descartado de qualquer forma.
    }
    drop();
  }, [drop]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, setUser: adopt }),
    [status, user, login, register, logout, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
