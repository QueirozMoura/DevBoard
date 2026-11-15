import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderLoggedIn, resetClientState } from '../test/utils';

beforeEach(() => {
  resetClientState();
});

async function openMembers(projectName: RegExp) {
  renderLoggedIn('/projects');
  const user = userEvent.setup();
  const main = within(await screen.findByRole('main'));
  await user.click(await main.findByRole('link', { name: projectName }));
  await user.click(await screen.findByRole('link', { name: /Membros/ }));
  await screen.findByRole('heading', { name: 'Membros do projeto' });
  return user;
}

const row = (name: RegExp): HTMLElement => {
  const item = within(screen.getByRole('main')).getByText(name).closest('li');
  if (!item) throw new Error('linha do membro não encontrada');
  return item;
};

describe('membros — proprietário', () => {
  it('adiciona uma pessoa pelo e-mail, que passa a aparecer na lista', async () => {
    const user = await openMembers(/Plataforma de Pagamentos/);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);

    await user.type(screen.getByLabelText('E-mail'), 'isabela@devboard.dev');
    await user.click(screen.getByRole('button', { name: 'Adicionar ao projeto' }));

    expect(
      await screen.findByText('Isabela Nunes entrou no projeto.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Isabela Nunes')).toBeInTheDocument();
  });

  it('explica e-mail sem conta, e-mail já membro e e-mail inválido no próprio campo', async () => {
    const user = await openMembers(/Plataforma de Pagamentos/);
    const email = screen.getByLabelText('E-mail');
    const submit = screen.getByRole('button', { name: 'Adicionar ao projeto' });

    await user.type(email, 'nao-e-email');
    await user.click(submit);
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, 'ninguem@devboard.dev');
    await user.click(submit);
    expect(await screen.findByText('Nenhuma conta usa este e-mail.')).toBeInTheDocument();

    await user.clear(email);
    await user.type(email, 'marina@devboard.dev');
    await user.click(submit);
    expect(
      await screen.findByText('Esta pessoa já participa do projeto.'),
    ).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  it('muda papéis; ao se rebaixar a gestão de membros desaparece', async () => {
    const user = await openMembers(/Plataforma de Pagamentos/);

    const marinaRole = within(row(/^Marina Duarte$/)).getByRole('combobox', {
      name: 'Papel de Marina Duarte',
    });
    await user.selectOptions(marinaRole, 'OWNER');
    expect(
      await screen.findByText('Papel de Marina Duarte atualizado.'),
    ).toBeInTheDocument();

    // Com dois proprietários, Gustavo pode se rebaixar; Marina vira a única.
    const myRole = within(row(/^Gustavo Moura$/)).getByRole('combobox', {
      name: 'Papel de Gustavo Moura',
    });
    await user.selectOptions(myRole, 'MEMBER');
    expect(
      await screen.findByText('Papel de Gustavo Moura atualizado.'),
    ).toBeInTheDocument();
    // Agora é só membro: a tela de gestão some.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Adicionar ao projeto' }),
      ).not.toBeInTheDocument();
    });
  });

  it('o único proprietário não consegue deixar o projeto (LAST_OWNER)', async () => {
    const user = await openMembers(/Site Institucional/);
    await user.click(screen.getByRole('button', { name: 'Sair do projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sair deste projeto?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sair do projeto' }));

    expect(
      await within(dialog).findByText('O projeto precisa de pelo menos um proprietário.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Membros do projeto' }),
    ).toBeInTheDocument();
  });

  it('remove um membro só após confirmar', async () => {
    const user = await openMembers(/Plataforma de Pagamentos/);

    await user.click(screen.getByRole('button', { name: 'Remover Rafael Costa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover Rafael Costa?' });
    expect(within(dialog).getByText(/ficam sem responsável/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remover membro' }));

    expect(await screen.findByText('Membro removido.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Rafael Costa')).not.toBeInTheDocument();
    });
  });
});

describe('membros — membro comum', () => {
  it('não vê o formulário nem controles de papel; só pode sair do projeto', async () => {
    const user = await openMembers(/App Mobile v2/);

    expect(
      screen.queryByRole('button', { name: 'Adicionar ao projeto' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Só proprietários podem convidar/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair do projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sair deste projeto?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sair do projeto' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Projetos' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Você saiu do projeto.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: /App Mobile v2/ }),
    ).not.toBeInTheDocument();
  });
});
