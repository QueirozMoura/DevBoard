/** Códigos de erro do contrato (`error`). Decida sempre por eles, nunca por `message`. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'LOGIN_VALIDATION_ERROR'
  | 'INVALID_CURSOR'
  | 'UNAUTHORIZED'
  | 'USER_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'FORBIDDEN'
  | 'CSRF_ORIGIN_REJECTED'
  | 'NOT_FOUND'
  | 'INVITEE_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'ALREADY_MEMBER'
  | 'LAST_OWNER'
  | 'INVALID_ASSIGNEE'
  | 'INVALID_MOVE_TARGET'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  /** Falha de rede/transporte gerada no cliente (sem resposta do servidor). */
  | 'NETWORK_ERROR';

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  /** Código estável (`error`); pode ser `FST_*` ou desconhecido, por isso `string`. */
  readonly code: ErrorCode | (string & {});
  readonly details: FieldIssue[];
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: FieldIssue[] = [],
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

const FRIENDLY: Record<string, string> = {
  VALIDATION_ERROR: 'Confira os campos e tente novamente.',
  LOGIN_VALIDATION_ERROR: 'Informe um e-mail válido e a senha (mínimo de 8 caracteres).',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_ALREADY_EXISTS: 'Já existe uma conta com este e-mail.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente.',
  USER_NOT_FOUND: 'Sua sessão expirou. Entre novamente.',
  INVALID_REFRESH_TOKEN: 'Sua sessão expirou. Entre novamente.',
  FORBIDDEN: 'Você não tem permissão para fazer isso neste projeto.',
  CSRF_ORIGIN_REJECTED: 'A origem desta página não é permitida pela API.',
  NOT_FOUND: 'Não encontramos este item. Ele pode ter sido removido.',
  INVITEE_NOT_FOUND: 'Nenhuma conta usa este e-mail.',
  ALREADY_MEMBER: 'Esta pessoa já participa do projeto.',
  LAST_OWNER: 'O projeto precisa de pelo menos um proprietário.',
  INVALID_ASSIGNEE: 'O responsável precisa ser membro do projeto.',
  INVALID_MOVE_TARGET: 'O quadro mudou. Recarregamos para você tentar de novo.',
  INVALID_CURSOR: 'A lista mudou. Recarregue a página.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um instante e tente de novo.',
  INTERNAL_ERROR: 'Algo deu errado do nosso lado. Tente novamente em instantes.',
  NETWORK_ERROR: 'Não foi possível falar com o servidor. Verifique sua conexão.',
};

/** Texto em português para exibição, escolhido pelo código (nunca pela mensagem da API). */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED' && error.retryAfter !== null) {
      return `Muitas tentativas. Tente de novo em ${error.retryAfter} s.`;
    }
    return FRIENDLY[error.code] ?? 'Não foi possível concluir a ação. Tente novamente.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}
