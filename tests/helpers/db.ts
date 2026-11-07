import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Esvazia todas as tabelas (somente no banco de testes). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const [{ current_database: name } = { current_database: '' }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (!name.endsWith('_test')) {
    throw new Error(`resetDatabase recusado: "${name}" não é um banco de testes.`);
  }
  await prisma.$executeRaw`TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE`;
}
