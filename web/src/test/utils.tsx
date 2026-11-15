import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders, routes } from '../App';
import { setMockGroups } from '../api/mock/config';
import { setMockLatency, setMockUser } from '../api/mock/router';
import { tokenStore } from '../api/tokenStore';

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}
export interface FakeCall {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
  credentials: RequestCredentials | undefined;
}

/** Substitui `fetch` por um servidor falso e registra as chamadas. */
export function stubFetch(handler: (call: FakeCall) => FakeReply | Promise<FakeReply>) {
  const calls: FakeCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FakeCall = {
      method: init?.method ?? 'GET',
      url: input instanceof Request ? input.url : input.toString(),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
    };
    calls.push(call);
    const reply = await handler(call);
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json', ...reply.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

export const USER = {
  id: '00000000-0000-7000-8000-0000000000aa',
  name: 'Gustavo Moura',
  email: 'gustavo@example.com',
  createdAt: '2026-11-01T12:00:00.000Z',
};

export function resetClientState(): void {
  tokenStore.clear();
  setMockUser(null);
  setMockGroups(['projects', 'members', 'tasks', 'comments', 'activities']);
  setMockLatency(0);
}

export function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    router,
    ...render(
      <AppProviders client={client}>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
  };
}

/** Conteúdo serializado de localStorage + sessionStorage (para provar que não guardam tokens). */
export function storageDump(): string {
  const parts: string[] = [];
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? '';
      parts.push(`${key}=${storage.getItem(key) ?? ''}`);
    }
  }
  return parts.join('\n');
}
