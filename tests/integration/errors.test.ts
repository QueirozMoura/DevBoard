import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

describe('tratamento de erros', () => {
  const app = buildApp(loadEnv());

  afterAll(async () => {
    await app.close();
  });

  it('não vaza detalhes internos em erros 500', async () => {
    app.get('/boom', () => {
      throw new Error('detalhe interno sensível');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('sensível');
    expect(res.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    });
  });
});
