import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';

describe('GET/PATCH /api/v1/me (PostgreSQL real)', () => {
  const app: FastifyInstance = buildApp(loadEnv());
  let token = '';
  let id = '';
  const login = (email: string, password: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  beforeAll(async () => app.ready());
  afterAll(async () => app.close());
  beforeEach(async () => {
    await resetDatabase(app.prisma);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Ana Silva',
        email: 'ana@example.com',
        password: 'senha segura 123',
      },
    });
    id = created.json<{ id: string }>().id;
    token = (await login('ana@example.com', 'senha segura 123')).json<{
      accessToken: string;
    }>().accessToken;
    await app.prisma.user.create({
      data: { name: 'Bia Silva', email: 'bia@example.com', passwordHash: 'hash interno' },
    });
  });
  const auth = { authorization: () => ({ authorization: `Bearer ${token}` }) };
  it('GET exige JWT válido, confirma existência e retorna somente dados públicos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: auth.authorization(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      name: 'Ana Silva',
      email: 'ana@example.com',
    });
    expect(Object.keys(response.json()).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain('hash interno');
  });
  it('rejeita credencial ausente/inválida e usuário removido', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: { authorization: 'Bearer invalid' },
        })
      ).statusCode,
    ).toBe(401);
    await app.prisma.user.delete({ where: { id } });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: auth.authorization(),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('atualiza nome/e-mail, normaliza e-mail e não aceita campos internos', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: auth.authorization(),
      payload: { name: '  Ana Maria ', email: ' ANA+novo@Example.COM ' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      name: 'Ana Maria',
      email: 'ana+novo@example.com',
    });
    for (const field of ['id', 'passwordHash', 'role', 'createdAt', 'refreshToken']) {
      const rejected = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: auth.authorization(),
        payload: { [field]: 'injetado' },
      });
      expect(rejected.statusCode).toBe(400);
    }
    expect(
      (await app.prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash,
    ).not.toBe('injetado');
  });
  it('rejeita payload vazio, inválido e email de outro usuário sem mudar perfil', async () => {
    for (const payload of [
      {},
      { name: 'x' },
      { email: 'inválido' },
      { email: 'ana@example.com', extra: true },
      { email: 'bia@example.com' },
    ]) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: auth.authorization(),
        payload,
      });
      expect(response.statusCode).toBe(payload.email === 'bia@example.com' ? 409 : 400);
    }
    expect(await app.prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Ana Silva',
      email: 'ana@example.com',
    });
  });
  it('constraint PostgreSQL resolve alteração concorrente para mesmo email', async () => {
    // Bia (criada em beforeEach) tem hash fictício e não consegue autenticar;
    // a corrida usa um segundo usuário real, cadastrado pela API.
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Carla Souza',
        email: 'carla@example.com',
        password: 'senha segura 123',
      },
    });
    expect(registered.statusCode).toBe(201);
    const secondLogin = await login('carla@example.com', 'senha segura 123');
    expect(secondLogin.statusCode).toBe(200);
    const tokenB = secondLogin.json<{ accessToken: string }>().accessToken;
    const patch = (bearer: string) =>
      app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${bearer}` },
        payload: { email: 'comum@example.com' },
      });
    const responses = await Promise.all([patch(token), patch(tokenB)]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(await app.prisma.user.count({ where: { email: 'comum@example.com' } })).toBe(
      1,
    );
  });
});
