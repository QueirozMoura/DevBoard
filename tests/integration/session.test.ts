import { createHash, randomBytes } from 'node:crypto';
import { hash } from 'argon2';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { passwordHashOptions } from '../../src/modules/auth/auth.password.js';
import { REFRESH_TOKEN_TTL_MS } from '../../src/modules/auth/auth.session.js';
import { resetDatabase } from '../helpers/db.js';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}
const credentials = { email: 'session@example.com', password: 'senha segura 123' };
const invalid = {
  error: 'INVALID_REFRESH_TOKEN',
  message: 'Sessão inválida ou expirada',
};
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

describe('refresh e logout (PostgreSQL real)', () => {
  let app: FastifyInstance;
  let otherApp: FastifyInstance;
  let passwordHash: string;
  const logs: string[] = [];
  const env = loadEnv();
  beforeAll(async () => {
    passwordHash = await hash(credentials.password, passwordHashOptions);
    app = buildApp(
      { ...env, LOG_LEVEL: 'info' },
      {
        write: (line) => {
          logs.push(line);
        },
      },
    );
    otherApp = buildApp(env);
    // Exercita o hook existente sem publicar endpoints de perfil.
    app.get(
      '/test/session-protected',
      { onRequest: app.authenticate },
      (request) => request.user,
    );
    await Promise.all([app.ready(), otherApp.ready()]);
  });
  afterAll(async () => {
    await Promise.all([app.close(), otherApp.close()]);
  });
  beforeEach(async () => {
    logs.length = 0;
    await resetDatabase(app.prisma);
    await app.prisma.user.create({
      data: { email: credentials.email, passwordHash, name: 'Ana' },
    });
  });
  const login = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    return response.json<Tokens>();
  };
  const request = (refreshToken: string, action = 'refresh', instance = app) =>
    instance.inject({
      method: 'POST',
      url: `/api/v1/auth/${action}`,
      payload: { refreshToken },
    });
  const stored = (token: string) =>
    app.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: digest(token) } });
  const assertRevoked = async (familyId: string) => {
    expect(
      await app.prisma.refreshToken.count({ where: { familyId, revokedAt: null } }),
    ).toBe(0);
  };

  it('login emite token opaco de 256 bits, salva exclusivamente SHA-256 e limita sessão a sete dias', async () => {
    const start = Date.now();
    const tokens = await login();
    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(tokens.refreshToken, 'base64url')).toHaveLength(32);
    const row = await stored(tokens.refreshToken);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(tokens.refreshToken);
    expect(row.revokedAt).toBeNull();
    expect(row.replacedById).toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(start + REFRESH_TOKEN_TTL_MS);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + REFRESH_TOKEN_TTL_MS,
    );
    expect(await app.accessTokens.verify(tokens.accessToken)).toEqual({ id: row.userId });
  });

  it('refresh rotaciona, invalida o anterior e preserva a validade absoluta', async () => {
    const initial = await login();
    const before = await stored(initial.refreshToken);
    const response = await request(initial.refreshToken);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    const next = response.json<Tokens>();
    expect(Object.keys(next).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(next.refreshToken).not.toBe(initial.refreshToken);
    expect(await app.accessTokens.verify(next.accessToken)).toEqual({
      id: before.userId,
    });
    const after = await stored(initial.refreshToken);
    const replacement = await stored(next.refreshToken);
    expect(after.revokedAt).not.toBeNull();
    expect(after.replacedById).toBe(replacement.id);
    expect(replacement.familyId).toBe(before.familyId);
    expect(replacement.expiresAt).toEqual(before.expiresAt);
    expect(replacement.revokedAt).toBeNull();
    expect((await request(next.refreshToken)).statusCode).toBe(200);
  });

  it('renova sem access token e emite JWT aceito pelo hook de proteção existente', async () => {
    const initial = await login();
    const next = (await request(initial.refreshToken)).json<Tokens>();
    const protectedRequest = (token: string) =>
      app.inject({
        method: 'GET',
        url: '/test/session-protected',
        headers: { authorization: `Bearer ${token}` },
      });
    const response = await protectedRequest(next.accessToken);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: (await stored(next.refreshToken)).userId });
    expect((await protectedRequest(next.refreshToken)).statusCode).toBe(401);
    await request(next.refreshToken, 'logout');
    // Logout revoga refresh; o JWT stateless continua válido até expirar.
    expect((await protectedRequest(next.accessToken)).statusCode).toBe(200);
  });

  it('reuso de ancestral revoga toda a família, persistindo a revogação apesar do 401', async () => {
    const initial = await login();
    const independent = await login();
    const second = (await request(initial.refreshToken)).json<Tokens>();
    const third = (await request(second.refreshToken)).json<Tokens>();
    const replay = await request(initial.refreshToken);
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual(invalid);
    await assertRevoked((await stored(initial.refreshToken)).familyId);
    expect((await request(third.refreshToken)).statusCode).toBe(401);
    expect((await request(independent.refreshToken)).statusCode).toBe(200);
  });

  it('logout revoga a sessão, é repetível e impede refresh posterior', async () => {
    const initial = await login();
    const response = await request(initial.refreshToken, 'logout');
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await request(initial.refreshToken, 'logout')).statusCode).toBe(204);
    expect((await request(initial.refreshToken)).statusCode).toBe(401);
    await assertRevoked((await stored(initial.refreshToken)).familyId);
  });

  it('logout com token ancestral também revoga o sucessor', async () => {
    const initial = await login();
    const next = (await request(initial.refreshToken)).json<Tokens>();
    expect((await request(initial.refreshToken, 'logout')).statusCode).toBe(204);
    expect((await request(next.refreshToken)).statusCode).toBe(401);
  });

  it('rejeita token expirado sem criar sucessor', async () => {
    const initial = await login();
    await app.prisma.refreshToken.update({
      where: { tokenHash: digest(initial.refreshToken) },
      data: {
        createdAt: new Date(Date.now() - 20000),
        expiresAt: new Date(Date.now() - 10000),
      },
    });
    const response = await request(initial.refreshToken);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(invalid);
    expect(await app.prisma.refreshToken.count()).toBe(1);
  });

  it('logout aceita sessão expirada e preserva outras sessões do usuário', async () => {
    const expired = await login();
    const independent = await login();
    await app.prisma.refreshToken.update({
      where: { tokenHash: digest(expired.refreshToken) },
      data: {
        createdAt: new Date(Date.now() - 20000),
        expiresAt: new Date(Date.now() - 10000),
      },
    });
    expect((await request(expired.refreshToken, 'logout')).statusCode).toBe(204);
    expect((await stored(expired.refreshToken)).revokedAt).not.toBeNull();
    expect((await request(expired.refreshToken)).statusCode).toBe(401);
    expect((await request(independent.refreshToken)).statusCode).toBe(200);
  });

  it('token desconhecido ou access token não revoga uma sessão válida', async () => {
    const initial = await login();
    for (const action of ['refresh', 'logout']) {
      for (const token of [randomBytes(32).toString('base64url'), initial.accessToken]) {
        const response = await request(token, action);
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual(invalid);
      }
    }
    expect((await stored(initial.refreshToken)).revokedAt).toBeNull();
    expect((await request(initial.refreshToken)).statusCode).toBe(200);
  });

  it('JSON malformado não expõe o token e não consome a sessão', async () => {
    const initial = await login();
    for (const action of ['refresh', 'logout']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${action}`,
        headers: { 'content-type': 'application/json' },
        payload: `{"refreshToken":"${initial.refreshToken}",`,
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).not.toContain(initial.refreshToken);
    }
    expect(logs.join('')).not.toContain(initial.refreshToken);
    expect((await stored(initial.refreshToken)).revokedAt).toBeNull();
    expect((await request(initial.refreshToken)).statusCode).toBe(200);
  });

  it.each([
    {},
    { refreshToken: '' },
    { refreshToken: 42 },
    { refreshToken: 'a'.repeat(10000) },
    { refreshToken: randomBytes(32).toString('base64url') },
    { refreshToken: 'invalido' },
    { refreshToken: 'A'.repeat(43), extra: true },
  ])('rejeita corpo/token inválido sem efeitos no banco (caso %#)', async (payload) => {
    for (const action of ['refresh', 'logout']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${action}`,
        payload,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(invalid);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await app.prisma.refreshToken.count()).toBe(0);
  });

  it('recusa tokens fornecidos somente em cookies ou query', async () => {
    const { refreshToken } = await login();
    for (const action of ['refresh', 'logout']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${action}?refreshToken=${refreshToken}`,
        headers: { cookie: `refreshToken=${refreshToken}` },
      });
      expect(response.statusCode).toBe(401);
    }
    expect((await request(refreshToken)).statusCode).toBe(200);
  });

  it('refresh simultâneo entre instâncias gera um único sucessor e revoga a família por reuso', async () => {
    const initial = await login();
    const responses = await Promise.all([
      request(initial.refreshToken),
      request(initial.refreshToken, 'refresh', otherApp),
      request(initial.refreshToken),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 401, 401]);
    expect(await app.prisma.refreshToken.count()).toBe(2);
    await assertRevoked((await stored(initial.refreshToken)).familyId);
    const winner = responses.find((r) => r.statusCode === 200)?.json<Tokens>();
    expect(winner).toBeDefined();
    expect((await request(winner?.refreshToken ?? '')).statusCode).toBe(401);
  });

  it('logout concorrente com refresh deixa a família revogada', async () => {
    const initial = await login();
    const [refresh, logout] = await Promise.all([
      request(initial.refreshToken),
      request(initial.refreshToken, 'logout', otherApp),
    ]);
    expect([200, 401]).toContain(refresh.statusCode);
    expect(logout.statusCode).toBe(204);
    await assertRevoked((await stored(initial.refreshToken)).familyId);
    if (refresh.statusCode === 200)
      expect((await request(refresh.json<Tokens>().refreshToken)).statusCode).toBe(401);
  });

  it('falha na assinatura reverte a transação e permite nova tentativa', async () => {
    const initial = await login();
    const spy = vi
      .spyOn(app.accessTokens, 'sign')
      .mockRejectedValueOnce(
        new Error(`segredo ${initial.refreshToken} ${env.JWT_SECRET}`),
      );
    try {
      expect((await request(initial.refreshToken)).statusCode).toBe(500);
      expect((await stored(initial.refreshToken)).revokedAt).toBeNull();
      expect(await app.prisma.refreshToken.count()).toBe(1);
    } finally {
      spy.mockRestore();
    }
    expect((await request(initial.refreshToken)).statusCode).toBe(200);
    expect(logs.join('')).not.toContain(initial.refreshToken);
    expect(logs.join('')).not.toContain(env.JWT_SECRET);
  });

  it('não registra tokens, hashes nem segredos nos fluxos de sucesso ou erro', async () => {
    const initial = await login();
    const next = (await request(initial.refreshToken)).json<Tokens>();
    await request(initial.refreshToken);
    await request(next.refreshToken, 'logout');
    const output = logs.join('');
    expect(output).toContain('request completed');
    for (const secret of [
      initial.accessToken,
      initial.refreshToken,
      next.accessToken,
      next.refreshToken,
      digest(initial.refreshToken),
      passwordHash,
      credentials.password,
      env.JWT_SECRET,
    ])
      expect(output).not.toContain(secret);
  });
});
