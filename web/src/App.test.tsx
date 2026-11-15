import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from './api/tokenStore';
import { renderApp, resetClientState, storageDump, stubFetch, USER } from './test/utils';

beforeEach(() => {
  resetClientState();
  localStorage.clear();
  sessionStorage.clear();
});

const refreshUrl = (url: string) => url.endsWith('/auth/refresh');

describe('sessão e rotas protegidas', () => {
  it('sem sessão, uma rota privada redireciona ao login e preserva o destino', async () => {
    stubFetch(() => ({
      status: 401,
      body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' },
    }));
    const { router } = renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/profile' });
  });

  it('restaura a sessão pelo cookie de refresh e mostra o painel', async () => {
    const calls = stubFetch((call) => {
      if (refreshUrl(call.url)) return { body: { accessToken: 'tok' } };
      if (call.url.endsWith('/api/v1/me')) return { body: USER };
      return { status: 404, body: { error: 'NOT_FOUND', message: 'x' } };
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: /Gustavo/ })).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/auth/refresh');
    expect(calls[0]?.credentials).toBe('include');
    expect(tokenStore.get()).toBe('tok');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});

describe('falha transitória ao restaurar a sessão', () => {
  it('429 não desloga: mostra o motivo, e "Tentar novamente" restaura a sessão', async () => {
    let refreshes = 0;
    stubFetch((call) => {
      if (refreshUrl(call.url)) {
        refreshes += 1;
        return refreshes === 1
          ? {
              status: 429,
              headers: { 'Retry-After': '12' },
              body: { error: 'RATE_LIMITED', message: 'x' },
            }
          : { body: { accessToken: 'tok' } };
      }
      if (call.url.endsWith('/api/v1/me')) return { body: USER };
      return { status: 404, body: { error: 'NOT_FOUND', message: 'x' } };
    });
    renderApp('/');
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', {
        name: 'Não foi possível restaurar sua sessão',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Muitas tentativas. Tente de novo em 12 s.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { name: /Gustavo/ })).toBeInTheDocument();
    expect(refreshes).toBe(2);
  });

  it('falha de rede também oferece nova tentativa em vez de ir ao login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('failed'))),
    );
    renderApp('/projects');
    expect(
      await screen.findByText(
        'Não foi possível falar com o servidor. Verifique sua conexão.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com outra conta' }),
    ).toBeInTheDocument();
  });
});

describe('login', () => {
  it('valida os campos antes de chamar a API', async () => {
    const calls = stubFetch(() => ({
      status: 401,
      body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' },
    }));
    renderApp('/login');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes('/auth/login'))).toHaveLength(0);
  });

  it('mostra erro pelo código (não pela mensagem do servidor) e não navega', async () => {
    stubFetch((call) =>
      call.url.includes('/auth/login')
        ? {
            status: 401,
            body: { error: 'INVALID_CREDENTIALS', message: 'TEXTO INTERNO DO SERVIDOR' },
          }
        : { status: 401, body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' } },
    );
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-errada-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('E-mail ou senha incorretos.');
    expect(alert).not.toHaveTextContent('TEXTO INTERNO');
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('entra, guarda o token só em memória e exibe o painel com dados simulados', async () => {
    const calls = stubFetch((call) => {
      if (call.url.includes('/auth/login')) {
        return {
          body: { accessToken: 'jwt-123', refreshToken: 'LEGADO-IGNORADO', user: USER },
        };
      }
      return { status: 401, body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' } };
    });
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mail'), 'gustavo@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha segura 123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: /Gustavo/ })).toBeInTheDocument();
    expect(await screen.findByText('Visão geral das tarefas')).toBeInTheDocument();
    const login = calls.find((c) => c.url.includes('/auth/login'));
    expect(login?.credentials).toBe('include');
    expect(login?.body).toEqual({
      email: 'gustavo@example.com',
      password: 'senha segura 123',
    });
    expect(tokenStore.get()).toBe('jwt-123');
    expect(storageDump()).not.toMatch(/jwt-123|LEGADO/);
    // Projetos e tarefas vêm do mock: nenhuma chamada de rede para eles.
    expect(calls.some((c) => c.url.includes('/projects'))).toBe(false);
    const projects = await screen.findByRole('heading', { name: 'Projetos' });
    const section = projects.closest('section');
    if (!section) throw new Error('seção de projetos não encontrada');
    expect(within(section).getByText('Plataforma de Pagamentos')).toBeInTheDocument();
  });
});

describe('cadastro', () => {
  it('mostra "e-mail já cadastrado" no campo, decidido pelo código', async () => {
    stubFetch((call) =>
      call.url.includes('/auth/register')
        ? {
            status: 409,
            body: { error: 'EMAIL_ALREADY_EXISTS', message: 'qualquer coisa' },
          }
        : { status: 401, body: { error: 'INVALID_REFRESH_TOKEN', message: 'x' } },
    );
    renderApp('/register');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nome'), 'Ana Silva');
    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha segura 123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('Já existe uma conta com este e-mail.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('sair e sessão expirada', () => {
  async function renderLoggedIn() {
    const calls = stubFetch((call) => {
      if (refreshUrl(call.url)) return { body: { accessToken: 'tok' } };
      if (call.url.endsWith('/api/v1/me')) return { body: USER };
      if (call.url.includes('/auth/logout')) return { status: 204 };
      return { status: 404, body: { error: 'NOT_FOUND', message: 'x' } };
    });
    renderApp('/');
    await screen.findByRole('heading', { name: /Gustavo/ });
    return calls;
  }

  it('o menu do usuário encerra a sessão, limpa o token e volta ao login', async () => {
    const calls = await renderLoggedIn();
    const user = userEvent.setup();

    const triggers = screen.getAllByRole('button', { name: /Gustavo Moura/ });
    const trigger = triggers[0];
    if (!trigger) throw new Error('menu do usuário não encontrado');
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: /Sair/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    });
    expect(tokenStore.get()).toBeNull();
    const logout = calls.find((c) => c.url.includes('/auth/logout'));
    expect(logout?.credentials).toBe('include');
    expect(logout?.body).toEqual({});
  });
});
