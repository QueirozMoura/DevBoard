/**
 * Quais endpoints são simulados no navegador. Cada grupo corresponde a operações
 * `x-status: planned` do openapi.json. Quando o backend implementar um grupo, basta
 * removê-lo de `VITE_MOCKS` (ex.: `VITE_MOCKS=tasks,comments,activities`) — nenhum
 * código de tela muda. Em build de produção o padrão é `none`.
 */
export type MockGroup = 'projects' | 'members' | 'tasks' | 'comments' | 'activities';

export const PLANNED_GROUPS: readonly MockGroup[] = [
  'projects',
  'members',
  'tasks',
  'comments',
  'activities',
];

function parse(value: string | undefined): Set<MockGroup> {
  const text = (value ?? (import.meta.env.DEV ? 'planned' : 'none')).trim();
  if (text === 'none' || text === '') return new Set();
  if (text === 'planned' || text === 'all') return new Set(PLANNED_GROUPS);
  return new Set(
    text
      .split(',')
      .map((part) => part.trim())
      .filter((part): part is MockGroup => (PLANNED_GROUPS as string[]).includes(part)),
  );
}

let enabled = parse(import.meta.env.VITE_MOCKS);

export function setMockGroups(groups: readonly MockGroup[]): void {
  enabled = new Set(groups);
}

export function mockGroupEnabled(group: MockGroup): boolean {
  return enabled.has(group);
}

/** Grupo de mock ao qual um caminho pertence; `null` para rotas reais (auth, /me, /health). */
export function groupOf(path: string): MockGroup | null {
  const clean = path.split('?')[0] ?? path;
  if (/^\/api\/v1\/projects\/[^/]+\/members(\/[^/]+)?$/.test(clean)) return 'members';
  if (/^\/api\/v1\/projects\/[^/]+\/(board|tasks)$/.test(clean)) return 'tasks';
  if (/^\/api\/v1\/projects\/[^/]+\/activities$/.test(clean)) return 'activities';
  if (/^\/api\/v1\/projects(\/[^/]+)?$/.test(clean)) return 'projects';
  if (/^\/api\/v1\/tasks\/[^/]+(\/move)?$/.test(clean)) return 'tasks';
  if (/^\/api\/v1\/tasks\/[^/]+\/comments$/.test(clean)) return 'comments';
  if (/^\/api\/v1\/comments\/[^/]+$/.test(clean)) return 'comments';
  return null;
}
