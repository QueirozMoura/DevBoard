import { type Result } from '../helpers/api.js';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createSession } from '../../src/modules/auth/auth.session.js';
import { resetDatabase } from '../helpers/db.js';

const env = loadEnv();
const app = buildApp(env);
beforeAll(() => app.ready());
afterAll(() => app.close());
beforeEach(() => resetDatabase(app.prisma));
async function cookie() {
  const user = await app.prisma.user.create({
    data: { name: 'Ana', email: 'ana@test.com', passwordHash: 'unused' },
  });
  return `refresh_token=${await createSession(app.prisma, user.id)}`;
}
it('valida Origin antes de consumir token, prioriza cookie e limpa no logout', async () => {
  const token = await cookie();
  for (const origin of [undefined, 'https://evil.test']) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: token, ...(origin ? { origin } : {}) },
      payload: {},
    });
    expect(r.statusCode).toBe(403);
    expect(r.headers['set-cookie']).toBeUndefined();
  }
  const headers = { cookie: token, origin: 'http://localhost:5173' };
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers,
    payload: { refreshToken: 'invalid' },
  });
  expect(r.statusCode).toBe(200);
  expect(r.headers['set-cookie']).toContain('SameSite=Strict');
  expect(r.headers['set-cookie']).toContain('Path=/api/v1/auth');
  const logout = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { ...headers, cookie: `refresh_token=${r.json<Result>().refreshToken}` },
    payload: {},
  });
  expect(logout.statusCode).toBe(204);
  expect(logout.headers['set-cookie']).toContain('Max-Age=0');
});
it('CORS só permite origens da allowlist', async () => {
  for (const origin of ['http://localhost:5173', 'https://evil.test']) {
    const r = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/refresh',
      headers: { origin, 'access-control-request-method': 'POST' },
    });
    expect(r.headers['access-control-allow-origin']).toBe(
      origin === 'http://localhost:5173' ? origin : undefined,
    );
  }
});
it('cookie inválido é limpo; cross-site não consome a sessão', async () => {
  const token = await cookie();
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: {
      cookie: token,
      origin: 'http://localhost:5173',
      'sec-fetch-site': 'cross-site',
    },
    payload: {},
  });
  expect(r.statusCode).toBe(403);
  expect(await app.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { cookie: 'refresh_token=bad', origin: 'http://localhost:5173' },
    payload: {},
  });
  expect(invalid.statusCode).toBe(401);
  expect(invalid.headers['set-cookie']).toContain('Max-Age=0');
});
