import { argon2id, hash } from 'argon2';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';
import type { RegisterInput } from './auth.schema.js';

export async function registerUser(prisma: PrismaClient, input: RegisterInput) {
  // Salt aleatório gerado pela biblioteca; parâmetros explícitos para Argon2id.
  const passwordHash = await hash(input.password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  try {
    // A constraint UNIQUE é a autoridade, inclusive sob concorrência.
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('EMAIL_ALREADY_EXISTS');
    }
    throw error;
  }
}
