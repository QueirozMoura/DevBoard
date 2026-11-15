import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderLoggedIn, resetClientState } from '../test/utils';

beforeEach(() => {
  resetClientState();
});

async function openTaskPanel(project: RegExp, task: RegExp) {
  renderLoggedIn('/projects');
  const user = userEvent.setup();
  const main = within(await screen.findByRole('main'));
  await user.click(await main.findByRole('link', { name: project }));
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^${task.source}`) }),
  );
  const panel = await screen.findByRole('dialog', { name: task });
  return { user, panel };
}

describe('comentários', () => {
  it('mostra comentários de outras pessoas; o proprietário pode excluir mas não editar', async () => {
    const { panel } = await openTaskPanel(
      /Plataforma de Pagamentos/,
      /Integrar antifraude no checkout/,
    );

    expect(await within(panel).findByText(/score do provedor/)).toBeInTheDocument();
    const section = within(panel).getByRole('region', { name: /Comentários/ });
    expect(within(section).getByText('Marina Duarte')).toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Editar comentário' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: 'Excluir comentário' }),
    ).toBeInTheDocument();
  });

  it('membro não edita nem exclui comentário alheio', async () => {
    const { panel } = await openTaskPanel(/App Mobile v2/, /Cache offline das listas/);
    expect(await within(panel).findByText(/500 itens/)).toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Editar comentário' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Excluir comentário' }),
    ).not.toBeInTheDocument();
  });

  it('publica, edita e exclui o próprio comentário', async () => {
    const { user, panel } = await openTaskPanel(
      /Plataforma de Pagamentos/,
      /Integrar antifraude no checkout/,
    );
    await within(panel).findByText(/score do provedor/);

    await user.type(
      within(panel).getByLabelText('Novo comentário'),
      'Fechado: vamos com o provedor A.',
    );
    await user.click(within(panel).getByRole('button', { name: 'Comentar' }));
    expect(await screen.findByText('Comentário publicado.')).toBeInTheDocument();
    expect(
      await within(panel).findByText('Fechado: vamos com o provedor A.'),
    ).toBeInTheDocument();
    expect(within(panel).getByLabelText('Novo comentário')).toHaveValue('');
    expect(
      within(panel).getByRole('heading', { name: /Comentários\s*2/ }),
    ).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Editar comentário' }));
    const edit = within(panel).getByLabelText('Editar comentário', {
      selector: 'textarea',
    });
    await user.clear(edit);
    await user.type(edit, 'Fechado: provedor B.');
    await user.click(within(panel).getByRole('button', { name: 'Salvar' }));
    expect(await within(panel).findByText('Fechado: provedor B.')).toBeInTheDocument();

    const mine = within(panel)
      .getAllByRole('button', { name: 'Excluir comentário' })
      .at(-1);
    if (!mine) throw new Error('botão de excluir ausente');
    await user.click(mine);
    const confirm = await screen.findByRole('dialog', {
      name: 'Excluir este comentário?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir comentário' }));
    await waitFor(() => {
      expect(within(panel).queryByText('Fechado: provedor B.')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Comentário excluído.')).toBeInTheDocument();
  });

  it('não publica comentário vazio', async () => {
    const { user, panel } = await openTaskPanel(
      /Plataforma de Pagamentos/,
      /Integrar antifraude no checkout/,
    );
    await within(panel).findByText(/score do provedor/);
    await user.type(within(panel).getByLabelText('Novo comentário'), '   ');
    await user.click(within(panel).getByRole('button', { name: 'Comentar' }));
    expect(
      within(panel).getByText('Escreva algo antes de comentar.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Comentário publicado.')).not.toBeInTheDocument();
  });

  it('o contador de comentários do cartão acompanha as mudanças', async () => {
    const { user, panel } = await openTaskPanel(
      /Plataforma de Pagamentos/,
      /Integrar antifraude no checkout/,
    );
    await within(panel).findByText(/score do provedor/);
    await user.type(within(panel).getByLabelText('Novo comentário'), 'Mais um');
    await user.click(within(panel).getByRole('button', { name: 'Comentar' }));
    await within(panel).findByText('Mais um');
    await user.click(within(panel).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      const card = screen.getByRole('button', {
        name: /^Integrar antifraude no checkout/,
      });
      expect(within(card).getByText('2')).toBeInTheDocument();
    });
  });
});

describe('atividades', () => {
  it('a aba Atividade lista o histórico do projeto, do mais recente ao mais antigo', async () => {
    renderLoggedIn('/projects');
    const user = userEvent.setup();
    const main = within(await screen.findByRole('main'));
    await user.click(await main.findByRole('link', { name: /Plataforma de Pagamentos/ }));
    await user.click(await screen.findByRole('link', { name: 'Atividade' }));

    expect(await screen.findByText('Gustavo Moura criou o projeto')).toBeInTheDocument();
    expect(screen.getByText(/moveu “Tela de status do pagamento”/)).toBeInTheDocument();
  });

  it('mudanças feitas pelo usuário entram no histórico da tarefa e do projeto', async () => {
    const { user, panel } = await openTaskPanel(
      /Plataforma de Pagamentos/,
      /Integrar antifraude no checkout/,
    );

    await user.selectOptions(
      within(panel).getByLabelText('Mover para a coluna'),
      'IN_REVIEW',
    );
    expect(
      await within(panel).findByText(
        'Gustavo Moura moveu “Integrar antifraude no checkout” de em andamento para em revisão',
      ),
    ).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('link', { name: 'Atividade' }));
    expect(
      await screen.findByText(/Gustavo Moura moveu “Integrar antifraude/),
    ).toBeInTheDocument();
  });
});
