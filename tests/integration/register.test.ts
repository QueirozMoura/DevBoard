import { verify } from 'argon2';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';

const validInput = {
  name: 'Ana Silva',
  email: 'ana@example.com',
  password: ' senha segura 123 ',
};
const validationError = {
  error: 'VALIDATION_ERROR',
  message: 'Dados de cadastro inválidos',
};
const duplicateError = { error: 'EMAIL_ALREADY_EXISTS', message: 'E-mail já cadastrado' };

describe('POST /api/v1/auth/register (PostgreSQL real)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp(loadEnv());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app.prisma);
  });

  const register = (payload: object) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

  it('cadastra e retorna 201 com apenas id, name, email e createdAt', async () => {
    const response = await register(validInput);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { email: validInput.email },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: user.id,
      name: validInput.name,
      email: validInput.email,
      createdAt: user.createdAt.toISOString(),
    });
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('password_hash');
    expect(response.body).not.toContain(validInput.password);
    expect(response.body).not.toContain(user.passwordHash);
  });

  it('armazena Argon2id com salt aleatório e preserva a senha exata', async () => {
    await register(validInput);
    await register({ ...validInput, email: 'outra@example.com' });
    const users = await app.prisma.user.findMany();
    expect(users).toHaveLength(2);
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
      expect(await verify(user.passwordHash, validInput.password)).toBe(true);
      expect(await verify(user.passwordHash, validInput.password.trim())).toBe(false);
    }
    expect(users[0]?.passwordHash).not.toBe(users[1]?.passwordHash);
  });

  it('normaliza trim + lowercase do e-mail antes de persistir e responder', async () => {
    const response = await register({ ...validInput, email: '  Ana@Example.COM  ' });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ email: string }>().email).toBe(validInput.email);
    expect(await app.prisma.user.count({ where: { email: validInput.email } })).toBe(1);
  });

  it('retorna 409 para e-mail duplicado após normalização (P2002 real)', async () => {
    await register(validInput);
    const response = await register({ ...validInput, email: ' ANA@EXAMPLE.COM ' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(duplicateError);
    expect(await app.prisma.user.count()).toBe(1);
  });

  it('permite só um cadastro entre quatro tentativas concorrentes', async () => {
    const responses = await Promise.all(
      ['ana@example.com', 'ANA@example.com', ' Ana@Example.COM ', 'ana@EXAMPLE.COM'].map(
        (email) => register({ ...validInput, email }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409, 409, 409,
    ]);
    for (const response of responses.filter((response) => response.statusCode === 409)) {
      expect(response.json()).toEqual(duplicateError);
    }
    expect(await app.prisma.user.count()).toBe(1);
  });

  it.each([
    ['nome ausente', { email: validInput.email, password: validInput.password }],
    ['nome vazio', { ...validInput, name: '   ' }],
    ['nome curto', { ...validInput, name: 'A' }],
    ['nome longo', { ...validInput, name: 'A'.repeat(101) }],
    ['nome não textual', { ...validInput, name: 123 }],
    ['e-mail ausente', { name: validInput.name, password: validInput.password }],
    ['e-mail inválido', { ...validInput, email: 'ana@' }],
    ['e-mail vazio', { ...validInput, email: '  ' }],
    ['e-mail longo', { ...validInput, email: `${'a'.repeat(243)}@example.com` }],
    ['e-mail não textual', { ...validInput, email: null }],
    ['senha ausente', { name: validInput.name, email: validInput.email }],
    ['senha vazia', { ...validInput, password: '' }],
    ['senha curta', { ...validInput, password: '1234567' }],
    ['senha longa', { ...validInput, password: 'a'.repeat(129) }],
    ['senha não textual', { ...validInput, password: 12345678 }],
    ['objeto vazio', {}],
    ['array', [validInput]],
    ['passwordHash extra', { ...validInput, passwordHash: 'hash-injetado' }],
    ['id extra', { ...validInput, id: crypto.randomUUID() }],
    ['role extra', { ...validInput, role: 'admin' }],
    ['createdAt extra', { ...validInput, createdAt: new Date().toISOString() }],
  ])('rejeita %s sem gravar usuário', async (_label, payload) => {
    const response = await register(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(validationError);
    expect(await app.prisma.user.count()).toBe(0);
  });

  it('aceita os limites de tamanho documentados', async () => {
    for (const [index, password] of ['a'.repeat(8), 'b'.repeat(128)].entries()) {
      const response = await register({
        name: index === 0 ? 'An' : 'A'.repeat(100),
        email: `limite${index}@example.com`,
        password,
      });
      expect(response.statusCode).toBe(201);
    }
    expect(await app.prisma.user.count()).toBe(2);
  });

  it('rejeita corpo ausente e JSON malformado sem expor seu conteúdo', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/register' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual(validationError);
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{"password":"segredo-nao-expor",',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('segredo-nao-expor');
    expect(await app.prisma.user.count()).toBe(0);
  });

  it('não expõe nem registra argumentos sensíveis em falha inesperada do Prisma', async () => {
    const failingApp = buildApp(loadEnv());
    const logError = vi.fn();
    failingApp.addHook('onRequest', (request, _reply, done) => {
      request.log.error = logError;
      done();
    });
    const create = vi
      .spyOn(failingApp.prisma.user, 'create')
      .mockRejectedValueOnce(
        new Error(
          `Detalhe interno: ${validInput.password} ${validInput.email} passwordHash`,
        ),
      );
    try {
      const response = await failingApp.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: validInput,
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor',
      });
      expect(logError.mock.calls).toEqual([
        [{ code: 'INTERNAL_ERROR' }, 'erro não tratado'],
      ]);
    } finally {
      create.mockRestore();
      await failingApp.close();
    }
    expect(await app.prisma.user.count()).toBe(0);
  });
});
