import { ApiError } from '../errors';
import { groupOf, mockGroupEnabled } from './config';
import { routes } from './routes';
import { clearMockStore, getMockStore, type MockUser, resetMockStore } from './store';

export interface RawResponse {
  status: number;
  body: unknown;
  retryAfter: number | null;
}

let latencyMs = import.meta.env.MODE === 'test' ? 0 : 220;
export function setMockLatency(ms: number): void {
  latencyMs = ms;
}

/** Chamado pela camada de autenticação: o mock simula dados do usuário real logado. */
export function setMockUser(user: MockUser | null): void {
  const current = getMockStore();
  if (user === null) clearMockStore();
  else if (current?.me.id !== user.id) resetMockStore(user);
}

export function isMocked(path: string): boolean {
  const group = groupOf(path);
  return group !== null && mockGroupEnabled(group);
}

export async function handleMock(
  method: string,
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<RawResponse> {
  if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const store = getMockStore();
  if (!store)
    return {
      status: 401,
      body: { error: 'UNAUTHORIZED', message: '' },
      retryAfter: null,
    };

  const [path = '', search = ''] = url.split('?');
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (route.method !== method || !match) continue;
    try {
      const result = route.handler({
        store,
        params: match.groups ?? {},
        query: new URLSearchParams(search),
        body,
      });
      return { ...result, retryAfter: null };
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          status: error.status,
          body: { error: error.code, message: error.message, details: error.details },
          retryAfter: null,
        };
      }
      throw error;
    }
  }
  return {
    status: 501,
    body: {
      error: 'INTERNAL_ERROR',
      message: `Mock não implementado: ${method} ${path}`,
    },
    retryAfter: null,
  };
}
