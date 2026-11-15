import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { cleanupSessions } from '../../src/modules/auth/auth.cleanup.js';
import { createSession, useSession } from '../../src/modules/auth/auth.session.js';
import { resetDatabase } from '../helpers/db.js';
import type { Result } from '../helpers/api.js';
const env = loadEnv({
  ...process.env,
  RATE_LIMIT_AUTH_MAX: '10',
  RATE_LIMIT_USER_MAX: '3',
});
const app = buildApp(env);
beforeAll(() => app.ready());
afterAll(() => app.close());
beforeEach(() => resetDatabase(app.prisma));
it('readiness consulta banco; falha retorna 503 genérico; Helmet ativo', async () => {
  const ok = await app.inject('/ready');
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toEqual({ status: 'ready' });
  expect(ok.headers['x-content-type-options']).toBe('nosniff');
  const spy = vi
    .spyOn(app.prisma, '$queryRaw')
    .mockRejectedValueOnce(new Error('password secret'));
  try {
    const fail = await app.inject('/ready');
    expect(fail.statusCode).toBe(503);
    expect(fail.body).not.toContain('secret');
  } finally {
    spy.mockRestore();
  }
});
it('auth limita por IP e login também por e-mail normalizado entre IPs', async () => {
  const invalid = { email: 'nobody@test.com', password: 'invalid password' };
  for (let i = 0; i < 10; i++)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: `10.1.0.${i + 1}`,
          payload: invalid,
        })
      ).statusCode,
    ).toBe(401);
  const email = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress: '10.1.0.100',
    payload: { ...invalid, email: 'NOBODY@test.com' },
  });
  expect(email.statusCode).toBe(429);
  expect(email.json<Result>().error).toBe('RATE_LIMITED');
  expect(Number(email.headers['retry-after'])).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++)
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      remoteAddress: '10.2.0.1',
      payload: {},
    });
  const ip = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    remoteAddress: '10.2.0.1',
    payload: {},
  });
  expect(ip.statusCode).toBe(429);
  expect(ip.json<Result>().error).toBe('RATE_LIMITED');
});
it('dados limitados por usuário mesmo trocando IP', async () => {
  const user = await app.prisma.user.create({
    data: { name: 'user', email: 'user@test.com', passwordHash: 'unused' },
  });
  const token = await app.accessTokens.sign(user.id);
  const request = (ip: string) =>
    app.inject({
      url: '/api/v1/projects',
      remoteAddress: ip,
      headers: { authorization: `Bearer ${token}` },
    });
  for (let i = 0; i < 3; i++)
    expect((await request(`10.3.0.${i + 1}`)).statusCode).toBe(200);
  const r = await request('10.3.0.99');
  expect(r.statusCode).toBe(429);
  expect(r.json<Result>().error).toBe('RATE_LIMITED');
});
it('limpeza remove expirados e preserva ancestrais de famílias ativas', async () => {
  const user = await app.prisma.user.create({
    data: { name: 'user', email: 'user@test.com', passwordHash: 'unused' },
  });
  const active = await createSession(app.prisma, user.id);
  await useSession(app.prisma, active, (id) => app.accessTokens.sign(id));
  const expired = await app.prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: 'e'.repeat(64),
      createdAt: new Date(Date.now() - 10000),
      familyId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  expect(await cleanupSessions(app.prisma)).toBe(1);
  expect(
    await app.prisma.refreshToken.findUnique({ where: { id: expired.id } }),
  ).toBeNull();
  expect(await app.prisma.refreshToken.count()).toBe(2);
});
it('produção exige CORS explícito HTTPS e emite cookie Secure', async () => {
  expect(() =>
    loadEnv({ ...process.env, NODE_ENV: 'production', CORS_ORIGIN: undefined }),
  ).toThrow('CORS_ORIGIN');
  expect(() =>
    loadEnv({
      ...process.env,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'http://localhost:5173',
    }),
  ).toThrow('CORS_ORIGIN');
  const prod = buildApp(
    loadEnv({
      ...process.env,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
    }),
  );
  try {
    const user = await app.prisma.user.create({
      data: { name: 'user', email: 'secure@test.com', passwordHash: 'unused' },
    });
    const token = await createSession(app.prisma, user.id);
    const r = await prod.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://app.example.com', cookie: `refresh_token=${token}` },
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['set-cookie']).toContain('Secure');
    expect(r.headers['set-cookie']).toContain('HttpOnly');
  } finally {
    await prod.close();
  }
});
