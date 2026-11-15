import type { FastifyError, FastifyInstance } from 'fastify';

const appErrors = {
  CSRF_ORIGIN_REJECTED: { status: 403, message: 'Origem não permitida' },
  FORBIDDEN: { status: 403, message: 'Permissão insuficiente' },
  NOT_FOUND: { status: 404, message: 'Recurso não encontrado' },
  INVITEE_NOT_FOUND: { status: 404, message: 'Usuário não encontrado' },
  ALREADY_MEMBER: { status: 409, message: 'Usuário já é membro' },
  LAST_OWNER: { status: 409, message: 'O projeto precisa de um OWNER' },
  INVALID_ASSIGNEE: { status: 422, message: 'Responsável inválido' },
  INVALID_MOVE_TARGET: { status: 422, message: 'Destino inválido' },
  INVALID_CURSOR: { status: 400, message: 'Cursor inválido' },
  RATE_LIMITED: { status: 429, message: 'Limite de requisições excedido' },
  VALIDATION_ERROR: { status: 400, message: 'Dados de cadastro inválidos' },
  EMAIL_ALREADY_EXISTS: { status: 409, message: 'E-mail já cadastrado' },
  LOGIN_VALIDATION_ERROR: { status: 400, message: 'Dados de login inválidos' },
  INVALID_CREDENTIALS: { status: 401, message: 'E-mail ou senha inválidos' },
  INVALID_REFRESH_TOKEN: { status: 401, message: 'Sessão inválida ou expirada' },
  USER_NOT_FOUND: { status: 401, message: 'Autenticação necessária' },
  UNAUTHORIZED: { status: 401, message: 'Autenticação necessária' },
} as const;

export class AppError extends Error {
  constructor(
    readonly code: keyof typeof appErrors,
    message?: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message ?? appErrors[code].message);
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
        ...(error.details ? { details: error.details } : {}),
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
