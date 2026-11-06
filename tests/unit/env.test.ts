import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/devboard_test',
};

describe('loadEnv', () => {
  it('aplica valores padrão', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'development' });
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('converte PORT para número', () => {
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejeita porta inválida', () => {
    expect(() => loadEnv({ ...base, PORT: '99999' })).toThrow(/PORT/);
  });

  it('exige DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('não vaza o valor das variáveis na mensagem de erro', () => {
    const secret = 'senha-super-secreta';
    expect(() => loadEnv({ DATABASE_URL: `http://u:${secret}@x` })).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(secret) as string,
      }) as Error,
    );
  });

  it('em ambiente de teste, recusa banco que não termina com _test', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/devboard',
      }),
    ).toThrow(/_test/);
  });
});
