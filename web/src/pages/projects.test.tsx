import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderLoggedIn, resetClientState } from '../test/utils';

beforeEach(() => {
  resetClientState();
});

/** O link do projeto existe na barra lateral e no cartão; os testes usam o conteúdo principal. */
const mainContent = async () => within(await screen.findByRole('main'));

const openProject = async (name: RegExp) => {
  const user = userEvent.setup();
  await user.click(await (await mainContent()).findByRole('link', { name }));
  return user;
};

describe('projetos', () => {
  it('lista os projetos com papel e contagens', async () => {
    renderLoggedIn('/projects');
    const main = await mainContent();
    const card = await main.findByRole('link', { name: /Plataforma de Pagamentos/ });
    expect(within(card).getByText('Proprietário')).toBeInTheDocument();
    expect(within(card).getByText(/7 tarefas · 3 membros/)).toBeInTheDocument();
    const mobile = main.getByRole('link', { name: /App Mobile v2/ });
    expect(within(mobile).getByText('Membro')).toBeInTheDocument();
  });

  it('cria um projeto e abre a página dele', async () => {
    renderLoggedIn('/projects');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Novo projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo projeto' });
    await user.type(within(dialog).getByLabelText('Nome'), '  Intranet  ');
    await user.type(within(dialog).getByLabelText('Descrição'), 'Portal interno');
    await user.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Intranet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Portal interno')).toBeInTheDocument();
    expect(await screen.findByText('Projeto criado.')).toBeInTheDocument();
    expect(screen.getByText('Proprietário')).toBeInTheDocument();
  });

  it('não envia nome vazio e mostra o erro no campo', async () => {
    renderLoggedIn('/projects');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Novo projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo projeto' });
    await user.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));

    expect(within(dialog).getByText('Informe o nome do projeto.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Projeto criado.')).not.toBeInTheDocument();
  });

  it('proprietário edita o projeto e o título muda', async () => {
    renderLoggedIn('/projects');
    const user = await openProject(/Plataforma de Pagamentos/);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar projeto' });
    const name = within(dialog).getByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'Pagamentos v2');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pagamentos v2' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Projeto atualizado.')).toBeInTheDocument();
  });

  it('membro comum não vê editar nem excluir', async () => {
    renderLoggedIn('/projects');
    await openProject(/App Mobile v2/);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'App Mobile v2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('exclui o projeto só após confirmar, avisa as consequências e volta à lista', async () => {
    renderLoggedIn('/projects');
    const user = await openProject(/Site Institucional/);

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    const dialog = await screen.findByRole('dialog', {
      name: /Excluir “Site Institucional”\?/,
    });
    expect(within(dialog).getByText(/Não é possível desfazer/)).toBeInTheDocument();
    expect(within(dialog).getByText(/3 tarefas/)).toBeInTheDocument();

    // Cancelar não exclui.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Site Institucional' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir projeto' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Projetos' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Projeto excluído.')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Site Institucional/ }),
    ).not.toBeInTheDocument();
  });

  it('projeto inexistente mostra estado de "não encontrado"', async () => {
    renderLoggedIn('/projects/00000000-0000-7000-8000-00000000ffff');
    expect(await screen.findByText('Projeto não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meus projetos' })).toBeInTheDocument();
  });
});
