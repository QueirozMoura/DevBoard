import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/devboard_test',
  JWT_SECRET: randomBytes(32).toString('hex'),
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

  it('aplica issuer e audience padrão e aceita chave aleatória de 256 bits', () => {
    const env = loadEnv(base);
    expect(env.JWT_SECRET).toBe(base.JWT_SECRET);
    expect(env.JWT_ISSUER).toBe('devboard-api');
    expect(env.JWT_AUDIENCE).toBe('devboard-client');
  });

  it.each([
    undefined,
    '',
    'curto',
    'a'.repeat(64),
    'ab'.repeat(32),
    '0123456789abcdef'.repeat(4),
    'z'.repeat(64),
    'a'.repeat(63),
  ])('recusa segredo ausente ou fraco (%s) sem expor seu valor', (JWT_SECRET) => {
    expect(() => loadEnv({ ...base, JWT_SECRET })).toThrow(/JWT_SECRET/);
    if (JWT_SECRET) {
      try {
        loadEnv({ ...base, JWT_SECRET });
      } catch (error) {
        expect((error as Error).message).not.toContain(JWT_SECRET);
      }
    }
  });

  it.each(['JWT_ISSUER', 'JWT_AUDIENCE'])('rejeita %s vazio', (name) => {
    expect(() => loadEnv({ ...base, [name]: '   ' })).toThrow(name);
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
        ...base,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/devboard',
      }),
    ).toThrow(/_test/);
  });
});
