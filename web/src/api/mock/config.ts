/** API real por padrão em desenvolvimento e produção. Mocks são opt-in via VITE_MOCKS. */
export type MockGroup = 'projects' | 'members' | 'tasks' | 'comments' | 'activities';

export const PLANNED_GROUPS: readonly MockGroup[] = [
  'projects',
  'members',
  'tasks',
  'comments',
  'activities',
];

function parse(value: string | undefined): Set<MockGroup> {
  const text = (value ?? 'none').trim();
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
