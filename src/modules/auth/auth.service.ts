import { hash, verify } from 'argon2';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../plugins/errors.js';
import { passwordHashOptions } from './auth.password.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

export async function registerUser(prisma: PrismaClient, input: RegisterInput) {
  // Salt aleatório gerado pela biblioteca; parâmetros explícitos para Argon2id.
  const passwordHash = await hash(input.password, passwordHashOptions);

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

export async function loginUser(
  prisma: PrismaClient,
  input: LoginInput,
  dummyPasswordHash: string,
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, createdAt: true, passwordHash: true },
  });

  // Verifica exatamente um hash mesmo quando o e-mail não existe.
  const matches = await verify(user?.passwordHash ?? dummyPasswordHash, input.password);
  if (!user || !matches) throw new AppError('INVALID_CREDENTIALS');

  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}
