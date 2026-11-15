import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError, describeError } from './errors';
import { modelKeys, TASK_PRIORITIES, TASK_STATUSES } from './types';

interface Schema {
  properties?: Record<string, unknown>;
  enum?: string[];
}
const spec = JSON.parse(
  readFileSync(resolve(process.cwd(), '../openapi.json'), 'utf8'),
) as { components: { schemas: Record<string, Schema> } };
const schemas = spec.components.schemas;

describe('contrato (openapi.json)', () => {
  it.each(Object.entries(modelKeys))(
    'modelo %s tem as mesmas chaves do contrato',
    (name, keys) => {
      const properties =
        schemas[name === 'BoardColumn' ? 'BoardColumn' : name]?.properties;
      expect(Object.keys(properties ?? {}).sort()).toEqual(Object.keys(keys).sort());
    },
  );

  it('status e prioridades coincidem com os enums do contrato', () => {
    expect([...TASK_STATUSES]).toEqual(schemas.TaskStatus?.enum);
    expect([...TASK_PRIORITIES]).toEqual(schemas.TaskPriority?.enum);
  });

  it('todo código de erro do contrato tem texto próprio em português', () => {
    const generic = describeError(new ApiError(418, 'CODIGO_INEXISTENTE', 'x'));
    for (const code of schemas.ErrorCode?.enum ?? []) {
      expect(
        describeError(new ApiError(400, code, 'texto do servidor ignorado')),
      ).not.toBe(generic);
    }
  });

  it('o texto exibido depende do código, nunca da mensagem do servidor', () => {
    const a = describeError(new ApiError(401, 'INVALID_CREDENTIALS', 'mensagem A'));
    const b = describeError(new ApiError(401, 'INVALID_CREDENTIALS', 'mensagem B'));
    expect(a).toBe(b);
    expect(a).not.toContain('mensagem');
  });
});
