import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .describe('Connection string do PostgreSQL'),
  JWT_SECRET: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Exige 32 bytes aleatórios em hexadecimal minúsculo')
    .refine(
      (value) => new Set(value).size >= 10 && !/^(.+)\1+$/.test(value),
      'O segredo deve ser aleatório, sem padrões repetidos',
    ),
  JWT_ISSUER: z.string().trim().min(1).max(200).default('devboard-api'),
  JWT_AUDIENCE: z.string().trim().min(1).max(200).default('devboard-client'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente. Falha rápido (no boot) com mensagem clara,
 * sem nunca incluir os valores recebidos — eles podem conter segredos.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${problems}`);
  }

  const env = result.data;

  // Guarda de isolamento: testes nunca podem rodar contra o banco de desenvolvimento.
  if (env.NODE_ENV === 'test') {
    const dbName = new URL(env.DATABASE_URL).pathname.slice(1);
    if (!dbName.endsWith('_test')) {
      throw new Error(
        'Em NODE_ENV=test, o nome do banco em DATABASE_URL deve terminar com "_test".',
      );
    }
  }

  return env;
}
