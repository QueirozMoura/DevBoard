import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { projectsApi, tasksApi } from './api/endpoints';
import { setMockLatency } from './api/mock/router';
import { resetMockStore } from './api/mock/store';
import { tokenStore } from './api/tokenStore';
import type { Board } from './api/types';
import { useMoveTask } from './mutations';
import { keys } from './queries';
import { resetClientState, USER } from './test/utils';

beforeEach(() => {
  resetClientState();
  tokenStore.set('tok');
  resetMockStore(USER);
});

async function setup() {
  const project = (await projectsApi.list()).items.find(
    (p) => p.name === 'Plataforma de Pagamentos',
  );
  if (!project) throw new Error('seed ausente');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const board = await tasksApi.board(project.id);
  client.setQueryData(keys.board(project.id), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMoveTask(project.id), { wrapper });
  const read = () => client.getQueryData<Board>(keys.board(project.id));
  const ids = (status: string) =>
    read()
      ?.columns.find((c) => c.status === status)
      ?.tasks.map((t) => t.id) ?? [];
  return { project, board, result, read, ids };
}

describe('useMoveTask', () => {
  it('atualiza o quadro na hora (otimista) e persiste com status e afterTaskId', async () => {
    const { board, result, ids } = await setup();
    const [first] = board.columns[0]?.tasks ?? [];
    const lastDone = board.columns[3]?.tasks.at(-1);
    if (!first || !lastDone) throw new Error('seed inesperado');
    setMockLatency(40);

    result.current.mutate({ taskId: first.id, status: 'DONE', afterTaskId: lastDone.id });

    // Antes da resposta do servidor o cartão já mudou de coluna.
    await waitFor(() => {
      expect(ids('DONE').at(-1)).toBe(first.id);
    });
    expect(ids('TODO')).not.toContain(first.id);
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const persisted = await tasksApi.get(first.id);
    expect(persisted.status).toBe('DONE');
  });

  it('se a API recusar (422), restaura o quadro anterior', async () => {
    const { board, result, read } = await setup();
    const [first] = board.columns[0]?.tasks ?? [];
    if (!first) throw new Error('seed inesperado');
    const before = structuredClone(read());
    setMockLatency(40);

    result.current.mutate({
      taskId: first.id,
      status: 'DONE',
      afterTaskId: '00000000-0000-7000-8000-00000000ffff',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toMatchObject({
      code: 'INVALID_MOVE_TARGET',
      status: 422,
    });
    expect(read()).toEqual(before);
    expect((await tasksApi.get(first.id)).status).toBe('TODO');
  });
});
