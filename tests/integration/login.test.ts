import { createHmac, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { decodeJwt, jwtVerify, SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { passwordHashOptions } from '../../src/modules/auth/auth.password.js';
import { resetDatabase } from '../helpers/db.js';

// Espiona chamadas sem substituir o hash ou a verificação Argon2 reais.
vi.mock('argon2', { spy: true });

const credentials = { email: 'ana@example.com', password: ' senha segura 123 ' };
const invalidCredentials = {
  error: 'INVALID_CREDENTIALS',
  message: 'E-mail ou senha inválidos',
};
const unauthorized = { error: 'UNAUTHORIZED', message: 'Autenticação necessária' };

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; email: string; createdAt: string };
}

describe('login e autenticação JWT (PostgreSQL real)', () => {
  const env = loadEnv();
  let app: FastifyInstance;
  let passwordHash: string;
  let userId: string;
  const protectedHandler = vi.fn((request: FastifyRequest) => request.user);

  beforeAll(async () => {
    passwordHash = await argon2.hash(credentials.password, passwordHashOptions);
    app = buildApp(env);
    // Rota exclusiva do teste; não existe na API publicada.
    app.get('/test/protected', { onRequest: app.authenticate }, (request) => {
      return protectedHandler(request);
    });
    app.get('/test/public', (request) => ({ user: request.user }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    protectedHandler.mockClear();
    await resetDatabase(app.prisma);
    const user = await app.prisma.user.create({
      data: { name: 'Ana Silva', email: credentials.email, passwordHash },
    });
    userId = user.id;
  });

  const login = (payload: object = credentials) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });
  const protectedRequest = (token: string) =>
    app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: `Bearer ${token}` },
    });
  const customToken = (
    claims: Record<string, unknown> = {},
    algorithm = 'HS256',
    key: Uint8Array = Buffer.from(env.JWT_SECRET, 'hex'),
  ) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: userId,
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      iat: now,
      exp: now + 900,
      ...claims,
    })
      .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
      .sign(key);
  };

  it('retorna somente accessToken e dados públicos, com JWT válido por 15 minutos', async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<LoginResponse>();
    const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(body).toEqual({
      accessToken: expect.any(String) as string,
      user: {
        id: userId,
        name: stored.name,
        email: stored.email,
        createdAt: stored.createdAt.toISOString(),
      },
    });
    const { payload, protectedHeader } = await jwtVerify(
      body.accessToken,
      Buffer.from(env.JWT_SECRET, 'hex'),
      { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    );
    expect(protectedHeader).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({
      sub: userId,
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900);
    for (const value of [
      passwordHash,
      credentials.password,
      'passwordHash',
      'refreshToken',
      env.JWT_SECRET,
    ]) {
      expect(response.body).not.toContain(value);
      expect(JSON.stringify(decodeJwt(body.accessToken))).not.toContain(value);
    }
    expect(await app.prisma.refreshToken.count()).toBe(0);
  });

  it('aceita a senha criada pelo endpoint de cadastro', async () => {
    const input = { ...credentials, name: 'Bia', email: 'bia@example.com' };
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: input }))
        .statusCode,
    ).toBe(201);
    const response = await login({ email: input.email, password: input.password });
    expect(response.statusCode).toBe(200);
    expect(response.json<LoginResponse>().user.email).toBe(input.email);
  });

  it('normaliza o e-mail antes da consulta', async () => {
    const response = await login({ ...credentials, email: '  ANA@Example.COM  ' });
    expect(response.statusCode).toBe(200);
    expect(response.json<LoginResponse>().user.id).toBe(userId);
  });

  it.each([
    ['senha incorreta', { ...credentials, password: 'senha incorreta' }],
    ['usuário inexistente', { ...credentials, email: 'ausente@example.com' }],
    [
      'senha sem espaços originais',
      { ...credentials, password: credentials.password.trim() },
    ],
  ])('retorna o mesmo 401 para %s, sem detalhes sensíveis', async (_label, payload) => {
    const response = await login(payload);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(invalidCredentials);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await app.prisma.refreshToken.count()).toBe(0);
  });

  it('verifica um hash Argon2id de mesmo custo para senha incorreta e usuário inexistente', async () => {
    const verify = vi.mocked(argon2.verify);
    verify.mockClear();
    try {
      await login({ ...credentials, password: 'senha incorreta' });
      await login({
        ...credentials,
        email: 'ausente@example.com',
        password: 'senha incorreta',
      });
      expect(verify).toHaveBeenCalledTimes(2);
      const [real, dummy] = verify.mock.calls;
      expect(real?.[0]).toBe(passwordHash);
      expect(dummy?.[0]).not.toBe(passwordHash);
      for (const call of verify.mock.calls) {
        expect(call[0]).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
        expect(call[1]).toBe('senha incorreta');
      }
    } finally {
      verify.mockClear();
    }
  });

  it.each([
    ['objeto vazio', {}],
    ['array', [credentials]],
    ['e-mail ausente', { password: credentials.password }],
    ['e-mail inválido', { ...credentials, email: 'ana@' }],
    ['e-mail longo', { ...credentials, email: `${'a'.repeat(243)}@example.com` }],
    ['e-mail não textual', { ...credentials, email: null }],
    ['senha ausente', { email: credentials.email }],
    ['senha curta', { ...credentials, password: '1234567' }],
    ['senha longa', { ...credentials, password: 'a'.repeat(129) }],
    ['senha não textual', { ...credentials, password: 12345678 }],
    ['campo name extra', { ...credentials, name: 'Ana' }],
    ['campo role extra', { ...credentials, role: 'admin' }],
    ['campo passwordHash extra', { ...credentials, passwordHash: 'injetado' }],
  ])('rejeita %s com erro de validação genérico', async (_label, payload) => {
    const response = await login(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'LOGIN_VALIDATION_ERROR',
      message: 'Dados de login inválidos',
    });
  });

  it('rejeita corpo ausente e JSON malformado sem revelar conteúdo', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/v1/auth/login' });
    expect(missing.statusCode).toBe(400);
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"password":"segredo-nao-expor",',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('segredo-nao-expor');
  });

  it('autentica a rota usando o token emitido pelo login, sem vazar identidade entre requisições', async () => {
    const { accessToken } = (await login()).json<LoginResponse>();
    const response = await protectedRequest(accessToken);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: userId });
    expect(protectedHandler).toHaveBeenCalledTimes(1);
    const publicResponse = await app.inject({ method: 'GET', url: '/test/public' });
    expect(publicResponse.json()).toEqual({ user: null });
  });

  const badClaims: [string, Record<string, unknown>][] = [
    ['expirado', { iat: 1, exp: 901 }],
    ['issuer incorreto', { iss: 'outro-issuer' }],
    ['audience incorreta', { aud: 'outro-cliente' }],
    ['sem expiração', { exp: undefined }],
    ['sem emissão', { iat: undefined }],
    ['sem issuer', { iss: undefined }],
    ['sem audience', { aud: undefined }],
    ['sem subject', { sub: undefined }],
    ['subject inválido', { sub: 'nao-e-uuid' }],
    ['emissão futura', { iat: Math.floor(Date.now() / 1000) + 3600 }],
    ['not-before futuro', { nbf: Math.floor(Date.now() / 1000) + 3600 }],
    ['validade superior a 15 minutos', { exp: Math.floor(Date.now() / 1000) + 3600 }],
  ];

  it.each(badClaims)(
    'rejeita JWT %s antes de executar a rota',
    async (_label, claims) => {
      const response = await protectedRequest(await customToken(claims));
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(unauthorized);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it('rejeita assinatura inválida', async () => {
    const response = await protectedRequest(
      await customToken({}, 'HS256', randomBytes(32)),
    );
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorized);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('rejeita algoritmo HS384 mesmo com assinatura válida', async () => {
    const original = await customToken();
    const header = Buffer.from(JSON.stringify({ alg: 'HS384', typ: 'JWT' })).toString(
      'base64url',
    );
    const unsigned = `${header}.${original.split('.')[1] ?? ''}`;
    // HMAC correto com a mesma chave; o verificador deve recusar o algoritmo.
    const signature = createHmac('sha384', Buffer.from(env.JWT_SECRET, 'hex'))
      .update(unsigned)
      .digest('base64url');
    const token = `${unsigned}.${signature}`;
    expect((await protectedRequest(token)).statusCode).toBe(401);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('rejeita algoritmo none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(JSON.stringify({ sub: userId })).toString('base64url');
    const response = await protectedRequest(`${header}.${payload}.`);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorized);
  });

  it.each([undefined, 'Bearer invalido', 'Basic abc', 'Bearer', 'Bearer token extra'])(
    'rejeita cabeçalho ausente ou inválido (%s)',
    async (authorization) => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/protected',
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(unauthorized);
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it('não aceita token em query ou cookie', async () => {
    const token = await customToken();
    const response = await app.inject({
      method: 'GET',
      url: `/test/protected?access_token=${token}`,
      headers: { cookie: `accessToken=${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('mantém erro centralizado e logs sem argumentos sensíveis em falha do banco', async () => {
    const lines: string[] = [];
    const loggingApp = buildApp(
      { ...env, LOG_LEVEL: 'info' },
      {
        write: (line) => {
          lines.push(line);
        },
      },
    );
    const query = vi
      .spyOn(loggingApp.prisma.user, 'findUnique')
      .mockRejectedValueOnce(
        new Error(`segredo ${credentials.password} ${env.JWT_SECRET} ${passwordHash}`),
      );
    try {
      const response = await loggingApp.inject({
        method: 'POST',
        url: '/api/v1/auth/login?access_token=token-na-query',
        headers: { authorization: 'Bearer token-no-header', cookie: 'segredo-no-cookie' },
        payload: credentials,
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor',
      });
      const output = lines.join('');
      expect(output).toContain('INTERNAL_ERROR');
      for (const value of [
        credentials.password,
        credentials.email,
        passwordHash,
        env.JWT_SECRET,
        'token-na-query',
        'token-no-header',
        'segredo-no-cookie',
      ]) {
        expect(output).not.toContain(value);
        expect(response.body).not.toContain(value);
      }
    } finally {
      query.mockRestore();
      await loggingApp.close();
    }
  });

  it('não registra tokens nem senhas no login válido', async () => {
    const lines: string[] = [];
    const loggingApp = buildApp(
      { ...env, LOG_LEVEL: 'info' },
      {
        write: (line) => {
          lines.push(line);
        },
      },
    );
    try {
      const response = await loggingApp.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: credentials,
      });
      expect(response.statusCode).toBe(200);
      const { accessToken } = response.json<LoginResponse>();
      for (const value of [
        accessToken,
        credentials.password,
        passwordHash,
        env.JWT_SECRET,
      ])
        expect(lines.join('')).not.toContain(value);
      expect(lines.join('')).toContain('request completed');
    } finally {
      await loggingApp.close();
    }
  });
});
