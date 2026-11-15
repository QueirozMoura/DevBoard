import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().positive().default(300),
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

  const origins = env.CORS_ORIGIN.split(',');
  if (env.NODE_ENV === 'production' && !source.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN obrigatória em produção');
  }
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        !['http:', 'https:'].includes(url.protocol) ||
        (env.NODE_ENV === 'production' && url.protocol !== 'https:')
      )
        throw new Error();
    } catch {
      throw new Error('CORS_ORIGIN deve conter origens exatas válidas');
    }
  }
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
