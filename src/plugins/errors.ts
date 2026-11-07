import type { FastifyError, FastifyInstance } from 'fastify';

const appErrors = {
  VALIDATION_ERROR: { status: 400, message: 'Dados de cadastro inválidos' },
  EMAIL_ALREADY_EXISTS: { status: 409, message: 'E-mail já cadastrado' },
  LOGIN_VALIDATION_ERROR: { status: 400, message: 'Dados de login inválidos' },
  INVALID_CREDENTIALS: { status: 401, message: 'E-mail ou senha inválidos' },
  INVALID_REFRESH_TOKEN: { status: 401, message: 'Sessão inválida ou expirada' },
  UNAUTHORIZED: { status: 401, message: 'Autenticação necessária' },
} as const;

export class AppError extends Error {
  constructor(readonly code: keyof typeof appErrors) {
    super(appErrors[code].message);
  }
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error;
}

/**
 * Tratamento de erros centralizado: resposta JSON uniforme e
 * nenhum detalhe interno (mensagem/stack) vazando em erros 5xx.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: 'NOT_FOUND',
      message: `Rota ${request.method} ${request.url} não encontrada`,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHORIZED') reply.header('WWW-Authenticate', 'Bearer');
      void reply.status(appErrors[error.code].status).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    // Só erros do Fastify (validação, JSON inválido, etc.) carregam statusCode 4xx.
    if (isFastifyError(error) && error.statusCode && error.statusCode < 500) {
      void reply
        .status(error.statusCode)
        .send({ error: error.code, message: 'Requisição inválida' });
      return;
    }

    // Erros do Prisma podem incluir argumentos de queries e hashes de senha.
    request.log.error({ code: 'INTERNAL_ERROR' }, 'erro não tratado');
    void reply
      .status(500)
      .send({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
  });
}
