import { ApiError, type FieldIssue } from './errors';
import { handleMock, isMocked, type RawResponse } from './mock/router';
import { emitSessionExpired, tokenStore } from './tokenStore';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Anexa o access token (padrão). `false` para login/cadastro/refresh. */
  auth?: boolean;
  /** Envia/recebe cookies (rotas `/auth/*`, que usam o cookie de refresh). */
  cookies?: boolean;
  signal?: AbortSignal | undefined;
}

function buildPath(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function transport(
  method: string,
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<RawResponse> {
  const url = buildPath(path, options.query);
  if (isMocked(path)) {
    return handleMock(method, url, options.body, options.signal);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${BASE}${url}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      credentials: options.cookies ? 'include' : 'same-origin',
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Falha de rede');
  }
  const text = response.status === 204 ? '' : await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  const retry = Number(response.headers.get('Retry-After'));
  return {
    status: response.status,
    body,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  };
}

function toApiError(raw: RawResponse): ApiError {
  const payload = (raw.body ?? {}) as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const code = typeof payload.error === 'string' ? payload.error : 'INTERNAL_ERROR';
  const message = typeof payload.message === 'string' ? payload.message : 'Erro';
  const details = Array.isArray(payload.details) ? (payload.details as FieldIssue[]) : [];
  return new ApiError(raw.status, code, message, details, raw.retryAfter);
}

function errorCode(raw: RawResponse): string | undefined {
  const code = (raw.body as { error?: unknown } | undefined)?.error;
  return typeof code === 'string' ? code : undefined;
}

let refreshInFlight: Promise<string> | null = null;

/**
 * Renova o access token usando o cookie HttpOnly de refresh. Uma única chamada fica em
 * andamento: requisições concorrentes compartilham a mesma Promise (repetir um refresh
 * token já rotacionado revogaria a sessão inteira no servidor).
 */
export function refreshSession(): Promise<string> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<string> {
  const raw = await transport(
    'POST',
    '/api/v1/auth/refresh',
    { body: {}, cookies: true },
    null,
  );
  if (raw.status === 200) {
    const token = (raw.body as { accessToken?: unknown } | undefined)?.accessToken;
    if (typeof token === 'string' && token) {
      tokenStore.set(token);
      return token;
    }
    throw new ApiError(raw.status, 'INTERNAL_ERROR', 'Resposta de refresh inválida');
  }
  const error = toApiError(raw);
  // Falha definitiva: a sessão não existe mais no servidor. Erros transitórios
  // (rede, 5xx, 429) preservam o estado atual para uma nova tentativa.
  if (error.code === 'INVALID_REFRESH_TOKEN' || error.code === 'CSRF_ORIGIN_REJECTED') {
    emitSessionExpired();
  }
  throw error;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const auth = options.auth ?? true;
  let token = auth ? tokenStore.get() : null;
  if (auth && !token) token = await refreshSession();

  let raw = await transport(method, path, options, token);

  if (auth && raw.status === 401) {
    const code = errorCode(raw);
    if (code === 'UNAUTHORIZED') {
      // Se outra requisição já renovou o token, apenas reaproveita-o.
      const current = tokenStore.get();
      const fresh = current && current !== token ? current : await refreshSession();
      raw = await transport(method, path, options, fresh);
      if (raw.status === 401) emitSessionExpired();
    } else if (code === 'USER_NOT_FOUND') {
      emitSessionExpired();
    }
  }

  if (raw.status >= 400) throw toApiError(raw);
  return raw.body as T;
}
