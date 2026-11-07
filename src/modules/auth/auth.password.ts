import { randomBytes } from 'node:crypto';
import { argon2id, hash } from 'argon2';

export const passwordHashOptions = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Gerado antes de aceitar requisições; mesmo custo do hash de cadastro. */
export function createDummyPasswordHash(): Promise<string> {
  return hash(randomBytes(32), passwordHashOptions);
}
