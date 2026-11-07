import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken() {
  const refreshToken = randomBytes(32).toString('base64url');
  return { refreshToken, tokenHash: hashToken(refreshToken) };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(prisma: PrismaClient, userId: string) {
  const { refreshToken, tokenHash } = generateToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return refreshToken;
}

/** O mesmo lock é usado em refresh e logout, em todas as instâncias da API. */
async function lockFamily(tx: Prisma.TransactionClient, familyId: string) {
  await tx.$queryRaw`
    SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${familyId}, 0))
  `;
}

export async function useSession(
  prisma: PrismaClient,
  refreshToken: string,
  sign: (userId: string) => Promise<string>,
  logout = false,
) {
  const tokenHash = hashToken(refreshToken);
  const result = await prisma.$transaction(
    async (tx) => {
      const candidate = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!candidate) return null;
      await lockFamily(tx, candidate.familyId);
      // Releitura após o lock: outra requisição pode ter consumido o token.
      const token = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!token) return null;
      const now = new Date();
      if (logout || token.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: token.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        // Retorna o erro fora da transação para preservar a revogação no commit.
        return logout ? { loggedOut: true as const } : null;
      }
      if (token.expiresAt <= now) return null;
      const next = generateToken();
      // A assinatura também deve falhar antes do commit, sem consumir a sessão.
      const accessToken = await sign(token.userId);
      const replacement = await tx.refreshToken.create({
        data: {
          userId: token.userId,
          familyId: token.familyId,
          tokenHash: next.tokenHash,
          // Validade absoluta da sessão, sem extensão indefinida a cada rotação.
          expiresAt: token.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: now, replacedById: replacement.id },
      });
      return { accessToken, refreshToken: next.refreshToken };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
  if (!result) throw new AppError('INVALID_REFRESH_TOKEN');
  return result;
}
