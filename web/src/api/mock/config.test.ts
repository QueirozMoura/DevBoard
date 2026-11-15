import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('usa API real por padrão mesmo em desenvolvimento', async () => {
  vi.stubEnv('VITE_MOCKS', undefined);
  vi.stubEnv('DEV', true);
  vi.resetModules();
  const { PLANNED_GROUPS, mockGroupEnabled } = await import('./config');
  expect(PLANNED_GROUPS.every((group) => !mockGroupEnabled(group))).toBe(true);
});
it('mocks só são habilitados explicitamente', async () => {
  vi.stubEnv('VITE_MOCKS', 'tasks,comments');
  vi.resetModules();
  const { mockGroupEnabled } = await import('./config');
  expect(mockGroupEnabled('tasks')).toBe(true);
  expect(mockGroupEnabled('comments')).toBe(true);
  expect(mockGroupEnabled('projects')).toBe(false);
});
