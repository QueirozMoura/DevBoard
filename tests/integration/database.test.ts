import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { resetDatabase } from '../helpers/db.js';

describe('PostgreSQL + Prisma (banco real de testes)', () => {
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

  const newUser = (email = 'ana@example.com') => ({
    email,
    name: 'Ana',
    passwordHash: 'hash-de-teste',
  });

  const expiresAt = () => new Date(Date.now() + 60_000);

  it('está conectado ao banco de testes isolado (devboard_test)', async () => {
    const rows = await app.prisma.$queryRaw<
      { db: string; port: number }[]
    >`SELECT current_database() AS db, inet_server_port() AS port`;
    expect(rows[0]?.db).toBe('devboard_test');
  });

  it('cria usuário com UUID e timestamps', async () => {
    const user = await app.prisma.user.create({ data: newUser() });
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('rejeita e-mail duplicado (P2002)', async () => {
    await app.prisma.user.create({ data: newUser() });
    const err = await app.prisma.user
      .create({ data: newUser() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });

  it('rejeita e-mail com maiúsculas (CHECK no banco)', async () => {
    await expect(
      app.prisma.user.create({ data: newUser('Ana@Example.com') }),
    ).rejects.toThrow(/users_email_lowercase_check/);
  });

  it('cria refresh token ligado ao usuário e exige hash único', async () => {
    const user = await app.prisma.user.create({ data: newUser() });
    const data = {
      userId: user.id,
      tokenHash: 'hash-1',
      familyId: crypto.randomUUID(),
      expiresAt: expiresAt(),
    };
    const token = await app.prisma.refreshToken.create({ data });
    expect(token.revokedAt).toBeNull();
    await expect(app.prisma.refreshToken.create({ data })).rejects.toThrow();
  });

  it('rejeita refresh token que expira antes de ser criado (CHECK)', async () => {
    const user = await app.prisma.user.create({ data: newUser() });
    await expect(
      app.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: 'hash-exp',
          familyId: crypto.randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
        },
      }),
    ).rejects.toThrow(/refresh_tokens_expires_after_created_check/);
  });

  it('exclui os refresh tokens em cascata ao excluir o usuário', async () => {
    const user = await app.prisma.user.create({ data: newUser() });
    await app.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'hash-2',
        familyId: crypto.randomUUID(),
        expiresAt: expiresAt(),
      },
    });
    await app.prisma.user.delete({ where: { id: user.id } });
    expect(await app.prisma.refreshToken.count()).toBe(0);
  });

  it('suporta a cadeia de rotação (replacedBy)', async () => {
    const user = await app.prisma.user.create({ data: newUser() });
    const familyId = crypto.randomUUID();
    const next = await app.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'novo', familyId, expiresAt: expiresAt() },
    });
    const old = await app.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'antigo',
        familyId,
        expiresAt: expiresAt(),
        revokedAt: new Date(),
        replacedById: next.id,
      },
    });
    const found = await app.prisma.refreshToken.findUniqueOrThrow({
      where: { id: old.id },
      include: { replacedBy: true },
    });
    expect(found.replacedBy?.tokenHash).toBe('novo');
  });
});
