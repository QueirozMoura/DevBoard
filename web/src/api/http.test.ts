import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from './endpoints';
import { ApiError } from './errors';
import { refreshSession } from './http';
import { onSessionExpired, tokenStore } from './tokenStore';
import { resetClientState, storageDump, stubFetch, USER } from '../test/utils';

beforeEach(() => {
  resetClientState();
  localStorage.clear();
  sessionStorage.clear();
});

const isRefresh = (url: string) => url.endsWith('/auth/refresh');

describe('cliente HTTP', () => {
  it('compartilha um único refresh entre requisições concorrentes sem token', async () => {
    let refreshes = 0;
    const calls = stubFetch(async (call) => {
      if (isRefresh(call.url)) {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { body: { accessToken: 'token-novo' } };
      }
      return { body: USER };
    });

    const results = await Promise.all([usersApi.me(), usersApi.me(), usersApi.me()]);

    expect(results).toHaveLength(3);
    expect(refreshes).toBe(1);
    const api = calls.filter((c) => !isRefresh(c.url));
    expect(api.every((c) => c.headers.get('Authorization') === 'Bearer token-novo')).toBe(
      true,
    );
  });

  it('em 401 UNAUTHORIZED renova uma vez e repete a chamada com o token novo', async () => {
    tokenStore.set('expirado');
    let refreshes = 0;
    const calls = stubFetch((call) => {
      if (isRefresh(call.url)) {
        refreshes += 1;
        return { body: { accessToken: 'renovado' } };
      }
      return call.headers.get('Authorization') === 'Bearer renovado'
        ? { body: USER }
        : { status: 401, body: { error: 'UNAUTHORIZED', message: 'x' } };
    });

    const [a, b] = await Promise.all([usersApi.me(), usersApi.me()]);

    expect(a).toEqual(USER);
    expect(b).toEqual(USER);
    expect(refreshes).toBe(1);
    expect(tokenStore.get()).toBe('renovado');
    expect(calls.filter((c) => !isRefresh(c.url))).toHaveLength(4);
  });

  it('o refresh envia cookies e corpo vazio, e ignora o refreshToken legado', async () => {
    const calls = stubFetch(() => ({
      body: { accessToken: 'a', refreshToken: 'LEGADO-NAO-USAR' },
    }));

    await expect(refreshSession()).resolves.toBe('a');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.credentials).toBe('include');
    expect(calls[0]?.body).toEqual({});
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
    expect(tokenStore.get()).toBe('a');
    expect(storageDump()).not.toContain('LEGADO');
  });

  it('refresh com sessão inválida limpa o estado, avisa e não guarda nada no storage', async () => {
    tokenStore.set('velho');
    const expired = vi.fn();
    const off = onSessionExpired(expired);
    stubFetch((call) =>
      isRefresh(call.url)
        ? {
            status: 401,
            body: { error: 'INVALID_REFRESH_TOKEN', message: 'qualquer texto' },
          }
        : { status: 401, body: { error: 'UNAUTHORIZED', message: 'x' } },
    );

    await expect(usersApi.me()).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });

    expect(tokenStore.get()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    off();
  });

  it('falha transitória do refresh (5xx) não encerra a sessão', async () => {
    tokenStore.set('velho');
    const expired = vi.fn();
    const off = onSessionExpired(expired);
    stubFetch((call) =>
      isRefresh(call.url)
        ? { status: 500, body: { error: 'INTERNAL_ERROR', message: 'x' } }
        : { status: 401, body: { error: 'UNAUTHORIZED', message: 'x' } },
    );

    await expect(usersApi.me()).rejects.toMatchObject({ status: 500 });

    expect(expired).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe('velho');
    off();
  });

  it('traduz erro de rede e lê Retry-After do 429', async () => {
    tokenStore.set('t');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('failed'))),
    );
    await expect(usersApi.me()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });

    stubFetch(() => ({
      status: 429,
      headers: { 'Retry-After': '12' },
      body: { error: 'RATE_LIMITED', message: 'x' },
    }));
    const error = await usersApi.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).retryAfter).toBe(12);
  });
});
