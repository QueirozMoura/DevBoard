import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApi } from '../../scripts/openapi.js';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

type Node = Record<string, unknown>;
const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;
const committed = JSON.parse(
  readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'),
) as Node;

function walk(
  value: unknown,
  visit: (node: Node, path: string) => void,
  path = '#',
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, visit, `${path}/${index}`);
    });
  } else if (value && typeof value === 'object') {
    visit(value as Node, path);
    for (const [key, child] of Object.entries(value))
      walk(child, visit, `${path}/${key}`);
  }
}

function resolve(pointer: string): unknown {
  return pointer
    .slice(2)
    .split('/')
    .reduce<unknown>((node, key) => (node as Node | undefined)?.[key], committed);
}

describe('openapi.json', () => {
  const app: FastifyInstance = buildApp(loadEnv());
  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('está sincronizado com scripts/openapi.ts (rode `npm run openapi:generate`)', () => {
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });

  it('é OpenAPI 3.1 com todos os $ref resolvendo', () => {
    expect(committed.openapi).toBe('3.1.0');
    const dangling: string[] = [];
    walk(committed, (node, path) => {
      const target = node.$ref;
      if (typeof target === 'string' && resolve(target) === undefined) {
        dangling.push(`${path} -> ${target}`);
      }
    });
    expect(dangling).toEqual([]);
  });

  it('tem operationId único e declara todos os parâmetros de caminho', () => {
    const ids: string[] = [];
    const components = committed.components as { parameters: Record<string, Node> };
    for (const [url, item] of Object.entries(committed.paths as Record<string, Node>)) {
      for (const method of METHODS) {
        const op = item[method] as Node | undefined;
        if (!op) continue;
        ids.push(op.operationId as string);
        const declared = ((op.parameters as Node[] | undefined) ?? []).map((p) => {
          const ref = p.$ref;
          if (typeof ref !== 'string') return p;
          const resolved = components.parameters[ref.split('/').pop() ?? ''];
          if (!resolved) throw new Error(`parâmetro ${ref} inexistente`);
          return resolved;
        });
        const inPath = [...url.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declaredPath = declared.filter((p) => p.in === 'path').map((p) => p.name);
        expect(declaredPath.sort(), `${method} ${url}`).toEqual(inPath.sort());
        const codes = Object.keys(op.responses as Node);
        expect(
          codes.some((code) => code.startsWith('2')),
          `${method} ${url} sem resposta 2xx`,
        ).toBe(true);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo schema de objeto exige apenas propriedades declaradas', () => {
    const problems: string[] = [];
    walk(committed.components, (node, path) => {
      const required = node.required;
      const props = node.properties;
      if (Array.isArray(required) && props && typeof props === 'object') {
        for (const key of required as string[]) {
          if (!(key in props)) problems.push(`${path}: "${key}" sem propriedade`);
        }
      }
    });
    expect(problems).toEqual([]);
  });

  it('x-status reflete exatamente as rotas registradas no servidor', () => {
    const mismatches: string[] = [];
    for (const [url, item] of Object.entries(committed.paths as Record<string, Node>)) {
      for (const method of METHODS) {
        const op = item[method] as Node | undefined;
        if (!op) continue;
        const fastifyUrl = url.replace(/\{(\w+)\}/g, ':$1');
        const exists = app.hasRoute({
          method: method.toUpperCase(),
          url: fastifyUrl,
        });
        const declared = op['x-status'];
        if ((declared === 'implemented') !== exists) {
          mismatches.push(
            `${method.toUpperCase()} ${url}: x-status=${String(declared)}, rota ${exists ? 'existe' : 'não existe'}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('o caminho legado /api/v1/auth/api/v1/me não existe mais', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/api/v1/me' });
    expect(response.statusCode).toBe(404);
  });
});
