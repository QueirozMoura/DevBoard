import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderLoggedIn, resetClientState } from '../test/utils';

beforeEach(() => {
  resetClientState();
});

/** Abre o quadro de um projeto pela lista (o seed é determinístico). */
async function openBoard(projectName: RegExp) {
  renderLoggedIn('/projects');
  const user = userEvent.setup();
  const main = within(await screen.findByRole('main'));
  await user.click(await main.findByRole('link', { name: projectName }));
  await screen.findByRole('heading', { level: 3, name: /A fazer/ });
  return user;
}

const column = (name: RegExp): HTMLElement => {
  const heading = screen.getByRole('heading', { level: 3, name });
  const section = heading.closest('section');
  if (!section) throw new Error('coluna não encontrada');
  return section;
};
const cardTitles = (name: RegExp): string[] =>
  within(column(name))
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent ?? '');

describe('quadro Kanban', () => {
  it('mostra as 4 colunas na ordem do contrato, com contagem e cartões', async () => {
    await openBoard(/Plataforma de Pagamentos/);

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'A fazer, 2',
      'Em andamento, 1',
      'Em revisão, 2',
      'Concluída, 2',
    ]);
    expect(cardTitles(/Em andamento/)).toEqual(['Integrar antifraude no checkout']);
    const card = within(column(/Em andamento/)).getByRole('button', {
      name: /^Integrar antifraude no checkout/,
    });
    expect(within(card).getByText('Urgente')).toBeInTheDocument();
  });

  it('cada cartão tem uma alça de reordenar acessível por teclado (botão rotulado)', async () => {
    await openBoard(/Plataforma de Pagamentos/);
    const handle = screen.getByRole('button', {
      name: 'Reordenar tarefa: Integrar antifraude no checkout',
    });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('cria uma tarefa pelo botão principal e ela aparece em A fazer', async () => {
    const user = await openBoard(/Plataforma de Pagamentos/);

    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova tarefa' });
    expect(within(dialog).getByLabelText('Título')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Título'), 'Revisar contrato do PSP');
    await user.selectOptions(within(dialog).getByLabelText('Prioridade'), 'HIGH');
    await user.selectOptions(
      within(dialog).getByLabelText('Responsável'),
      'Marina Duarte',
    );
    await user.type(within(dialog).getByLabelText('Prazo'), '2026-12-20');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

    expect(await screen.findByText('Tarefa criada.')).toBeInTheDocument();
    await waitFor(() => {
      expect(cardTitles(/A fazer/)).toContain('Revisar contrato do PSP');
    });
    expect(screen.getByRole('heading', { level: 3, name: /A fazer/ })).toHaveTextContent(
      '3',
    );
    const card = within(column(/A fazer/)).getByRole('button', {
      name: /^Revisar contrato do PSP/,
    });
    expect(within(card).getByText('Alta')).toBeInTheDocument();
    expect(within(card).getByText('20 de dez')).toBeInTheDocument();
  });

  it('o "+" da coluna abre a criação já na coluna certa e valida o título', async () => {
    const user = await openBoard(/Plataforma de Pagamentos/);

    await user.click(
      screen.getByRole('button', { name: 'Adicionar tarefa em Em revisão' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Nova tarefa' });
    expect(within(dialog).getByLabelText('Coluna')).toHaveValue('IN_REVIEW');

    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    expect(within(dialog).getByText('Informe o título da tarefa.')).toBeInTheDocument();
    expect(screen.queryByText('Tarefa criada.')).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Título'), 'Smoke test em produção');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => {
      expect(cardTitles(/Em revisão/)).toContain('Smoke test em produção');
    });
  });

  it('filtra por texto, prioridade e responsável, e desativa o arraste enquanto filtra', async () => {
    const user = await openBoard(/Plataforma de Pagamentos/);
    const search = screen.getByRole('searchbox', { name: 'Buscar por título' });

    await user.type(search, 'webhooks');
    expect(cardTitles(/Em revisão/)).toEqual(['Cobrir webhooks com testes']);
    expect(cardTitles(/A fazer/)).toEqual([]);
    expect(
      screen.getByRole('heading', { level: 3, name: /Em revisão/ }),
    ).toHaveTextContent('1 de 2');
    expect(screen.getByText(/Reordenar fica desativado/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Reordenar tarefa/ }),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'URGENT');
    expect(cardTitles(/Em andamento/)).toEqual(['Integrar antifraude no checkout']);
    expect(cardTitles(/Concluída/)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await user.selectOptions(screen.getByLabelText('Responsável'), 'Sem responsável');
    expect(cardTitles(/A fazer/)).toEqual(['Revisar política de estorno']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(cardTitles(/A fazer/)).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: /^Reordenar tarefa/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Reordenar fica desativado/)).not.toBeInTheDocument();
  });
});

describe('detalhes da tarefa', () => {
  async function openTask(title: RegExp, project = /Plataforma de Pagamentos/) {
    const user = await openBoard(project);
    await user.click(
      screen.getByRole('button', { name: new RegExp(`^${title.source}`) }),
    );
    const panel = await screen.findByRole('dialog', { name: title });
    return { user, panel };
  }

  it('abre o painel com os dados e o deep link ?task=', async () => {
    const { panel } = await openTask(/Integrar antifraude no checkout/);
    expect(within(panel).getByLabelText('Título')).toHaveValue(
      'Integrar antifraude no checkout',
    );
    expect(within(panel).getByLabelText('Descrição')).toHaveValue(
      'Bloquear transações acima do limite de risco e registrar o motivo.',
    );
    expect(within(panel).getByLabelText('Prioridade')).toHaveValue('URGENT');
    expect(within(panel).getByLabelText('Responsável')).toHaveDisplayValue(
      'Gustavo Moura',
    );
    expect(
      within(panel).getByRole('button', { name: 'Salvar alterações' }),
    ).toBeDisabled();
  });

  it('edita campos, salva só o que mudou e o cartão reflete a alteração', async () => {
    const { user, panel } = await openTask(/Integrar antifraude no checkout/);

    const title = within(panel).getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Antifraude no checkout v2');
    await user.selectOptions(within(panel).getByLabelText('Prioridade'), 'LOW');
    const save = within(panel).getByRole('button', { name: 'Salvar alterações' });
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText('Tarefa atualizada.')).toBeInTheDocument();
    await waitFor(() => {
      expect(cardTitles(/Em andamento/)).toEqual(['Antifraude no checkout v2']);
    });
    expect(
      within(panel).getByRole('button', { name: 'Salvar alterações' }),
    ).toBeDisabled();
  });

  it('não salva título vazio e mostra o erro no campo', async () => {
    const { user, panel } = await openTask(/Integrar antifraude no checkout/);
    await user.clear(within(panel).getByLabelText('Título'));
    await user.click(within(panel).getByRole('button', { name: 'Salvar alterações' }));
    expect(within(panel).getByText('Informe o título da tarefa.')).toBeInTheDocument();
  });

  it('muda a coluna pelo painel (alternativa ao arrastar) usando o fim da coluna', async () => {
    const { user, panel } = await openTask(/Integrar antifraude no checkout/);

    await user.selectOptions(within(panel).getByLabelText('Mover para a coluna'), 'DONE');

    expect(await screen.findByText('Movida para Concluída.')).toBeInTheDocument();
    await waitFor(() => {
      expect(cardTitles(/Concluída/)).toEqual([
        'Tela de status do pagamento',
        'Chave de idempotência nas cobranças',
        'Integrar antifraude no checkout',
      ]);
    });
    expect(cardTitles(/Em andamento/)).toEqual([]);
  });

  it('proprietário exclui a tarefa depois de confirmar', async () => {
    const { user, panel } = await openTask(/Revisar política de estorno/);

    await user.click(within(panel).getByRole('button', { name: 'Excluir tarefa' }));
    const confirm = await screen.findByRole('dialog', {
      name: /Excluir “Revisar política de estorno”\?/,
    });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir tarefa' }));

    expect(await screen.findByText('Tarefa excluída.')).toBeInTheDocument();
    await waitFor(() => {
      expect(cardTitles(/A fazer/)).toEqual(['Conciliar liquidações do Pix']);
    });
  });

  it('membro só vê "Excluir tarefa" nas que ele criou', async () => {
    const { panel } = await openTask(/Cache offline das listas/, /App Mobile v2/);
    expect(
      within(panel).queryByRole('button', { name: 'Excluir tarefa' }),
    ).not.toBeInTheDocument();
  });
});
