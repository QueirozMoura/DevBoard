/**
 * Access token SOMENTE em memória (módulo). Nunca em localStorage/sessionStorage/IndexedDB,
 * URL ou logs. Recarregar a página perde o token; a sessão é restaurada via cookie de refresh.
 */
let accessToken: string | null = null;
const listeners = new Set<() => void>();

export const tokenStore = {
  get: (): string | null => accessToken,
  set(token: string): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};

/** Disparado quando o refresh falha de forma definitiva (sessão encerrada no servidor). */
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSessionExpired(): void {
  tokenStore.clear();
  listeners.forEach((listener) => {
    listener();
  });
}
