import type { FastifyError, FastifyInstance } from 'fastify';

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error;
}

/**
 * Tratamento de erros mínimo e centralizado: resposta JSON uniforme e
 * nenhum detalhe interno (mensagem/stack) vazando em erros 5xx.
 * Erros de domínio (AppError) entram na Fase 1+.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: 'NOT_FOUND',
      message: `Rota ${request.method} ${request.url} não encontrada`,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    // Só erros do Fastify (validação, JSON inválido, etc.) carregam statusCode 4xx.
    if (isFastifyError(error) && error.statusCode && error.statusCode < 500) {
      void reply
        .status(error.statusCode)
        .send({ error: error.code, message: error.message });
      return;
    }

    request.log.error({ err: error }, 'erro não tratado');
    void reply
      .status(500)
      .send({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
  });
}
