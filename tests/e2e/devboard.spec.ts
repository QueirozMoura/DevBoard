import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from '../../src/config/env.js';
import { createPrismaClient } from '../../src/plugins/prisma.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* CI environment. */
}
const env = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://devboard:change-me@localhost:5433/devboard_test',
  JWT_SECRET: randomBytes(32).toString('hex'),
});
const prisma = createPrismaClient(env.DATABASE_URL);
const createdUsers: string[] = [];
const createdProjects: string[] = [];
test.afterAll(async () => {
  try {
    await prisma.project.deleteMany({ where: { id: { in: createdProjects } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  } finally {
    await prisma.$disconnect();
  }
});
const password = 'integration password 123';
async function register(page: Page) {
  const email = `e2e-${randomUUID()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Nome', { exact: true }).fill('Integration User');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const user = (await response.json()) as { id: string };
  createdUsers.push(user.id);
  await expect(page).toHaveURL('/');
  return email;
}
async function logout(page: Page) {
  await page.getByRole('button', { name: /Integration User/ }).click();
  const response = page.waitForResponse((r) => r.url().endsWith('/auth/logout'));
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL('/login');
}
async function project(page: Page) {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo projeto', exact: true });
  await dialog.getByLabel('Nome', { exact: true }).fill('Projeto integrado');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/projects') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const result = (await response.json()) as { id: string };
  createdProjects.push(result.id);
  await expect(
    page.getByRole('heading', { name: 'Projeto integrado', exact: true }),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
  return result.id;
}
async function task(page: Page, title: string) {
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova tarefa', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  const saved = page.waitForResponse(
    (r) =>
      /\/projects\/[^/]+\/tasks$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const result = (await response.json()) as { id: string };
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole('button', { name: new RegExp(title) })
      .filter({ hasNot: page.locator('[aria-label^="Reordenar"]') })
      .last(),
  ).toBeVisible();
  return result.id;
}

test('cadastro, sessão HttpOnly, projetos, tarefas, comentários, Kanban, histórico e logout reais', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = await register(page);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'refresh_token')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api/v1/auth',
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain('refresh_token');
  await logout(page);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/');
  const projectId = await project(page);
  const taskId = await task(page, 'Tarefa integrada');
  await page
    .getByRole('button', { name: /Tarefa integrada/ })
    .filter({ hasText: 'Tarefa integrada' })
    .click();
  const panel = page.getByRole('dialog', { name: 'Tarefa integrada', exact: true });
  await panel
    .getByLabel('Novo comentário', { exact: true })
    .fill('Comentário persistido no PostgreSQL');
  const commented = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/tasks/${taskId}/comments`) && r.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Comentar', exact: true }).click();
  expect((await commented).status()).toBe(201);
  await expect(
    panel.getByText('Comentário persistido no PostgreSQL', { exact: true }),
  ).toBeVisible();
  const moved = page.waitForResponse((r) => r.url().endsWith(`/tasks/${taskId}/move`));
  await panel.getByRole('combobox', { name: 'Mover para a coluna' }).selectOption('DONE');
  expect((await moved).status()).toBe(200);
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: /Concluída/ })
      .getByText('Tarefa integrada', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Projeto integrado', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Atividade', exact: true }).click();
  await expect(
    page.getByText('Integration User comentou em “Tarefa integrada”', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Integration User moveu “Tarefa integrada” de a fazer para concluída',
      { exact: true },
    ),
  ).toBeVisible();
  const stored = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { comments: true },
  });
  expect(stored.status).toBe('DONE');
  expect(stored.comments.map((c) => c.body)).toEqual([
    'Comentário persistido no PostgreSQL',
  ]);
  expect(await prisma.activity.count({ where: { projectId } })).toBe(4);
  expect(
    await page.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    ),
  ).not.toMatch(/accessToken|refreshToken|eyJ/);
  await logout(page);
  await page.reload();
  await expect(page).toHaveURL('/login');
  expect((await context.cookies()).some((c) => c.name === 'refresh_token')).toBe(false);
  expect(errors).toEqual([]);
});

test('arraste Kanban envia afterTaskId e persiste a nova coluna no banco', async ({
  page,
}) => {
  await register(page);
  await project(page);
  const taskId = await task(page, 'Arrastar tarefa');
  const handle = page.getByRole('button', {
    name: 'Reordenar tarefa: Arrastar tarefa',
    exact: true,
  });
  await handle.hover();
  const source = await handle.boundingBox();
  const target = await page.getByRole('region', { name: /Em andamento/ }).boundingBox();
  if (!source || !target) throw new Error('Kanban coordinates unavailable');
  const moved = page.waitForResponse((r) => r.url().endsWith(`/tasks/${taskId}/move`));
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2, {
    steps: 5,
  });
  await page.mouse.move(target.x + target.width / 2, target.y + 100, { steps: 20 });
  await expect(
    page.getByRole('status').filter({ hasText: /Tarefa movida/ }),
  ).toBeVisible();
  await page.mouse.up();
  const response = await moved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON() as unknown).toMatchObject({
    status: 'IN_PROGRESS',
    afterTaskId: null,
  });
  await expect(
    page
      .getByRole('region', { name: /Em andamento/ })
      .getByText('Arrastar tarefa', { exact: true }),
  ).toBeVisible();
  expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(
    'IN_PROGRESS',
  );
});
