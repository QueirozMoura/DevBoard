import { ApiError } from '../api/errors';

/** Mapeia `details` de um VALIDATION_ERROR (path → mensagem) para os campos do formulário. */
export function fieldErrors<K extends string>(
  error: unknown,
  fields: readonly K[],
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return result;
  for (const issue of error.details) {
    const field = fields.find((candidate) => candidate === issue.path);
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}

/** O erro só vira alerta geral quando nenhum campo o explicou. */
export function isFieldLevel(error: unknown, fields: readonly string[]): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'VALIDATION_ERROR' &&
    error.details.some((issue) => fields.includes(issue.path))
  );
}
