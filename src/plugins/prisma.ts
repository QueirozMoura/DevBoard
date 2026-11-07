import { PrismaPg } from '@prisma/adapter-pg';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/** Cria o client sobre um pool `pg` (conecta de forma preguiçosa, no primeiro uso). */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/**
 * Registra uma única instância do Prisma Client na aplicação (`app.prisma`)
 * e a desconecta em `app.close()`, liberando o pool de conexões.
 */
export function registerPrisma(app: FastifyInstance, env: Env): void {
  const prisma = createPrismaClient(env.DATABASE_URL);
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}
