/** Regras espelhadas do contrato (RegisterRequest/LoginRequest/ProfilePatch). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(value: string): string | undefined {
  const length = value.trim().length;
  if (length < 2) return 'Informe pelo menos 2 caracteres.';
  if (length > 100) return 'Use no máximo 100 caracteres.';
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const text = value.trim();
  if (!text) return 'Informe seu e-mail.';
  if (text.length > 254 || !EMAIL.test(text)) return 'Informe um e-mail válido.';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return 'Informe sua senha.';
  if (value.length < 8) return 'Use pelo menos 8 caracteres.';
  if (value.length > 128) return 'Use no máximo 128 caracteres.';
  return undefined;
}
