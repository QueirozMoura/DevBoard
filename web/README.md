# Frontend integrado

React/Vite usa a API real por padrão, tanto em desenvolvimento quanto no build.
Mocks são opt-in via `VITE_MOCKS=all` ou uma lista de grupos; `none` desativa todos.
Não há fallback silencioso para dados simulados quando a API está indisponível.

Na raiz do repositório, instale `npm ci` e `npm ci --prefix web`. Configure o `.env`
do backend a partir de `.env.example`, inicie o PostgreSQL local, aplique migrations
somente ao banco de desenvolvimento e execute `npm run dev` em um terminal.
Em outro, execute `npm --prefix web run dev` e abra `http://localhost:5173`.

As chamadas usam `/api` no mesmo origin. O proxy está em `vite.config.ts` e aponta
por padrão para `http://127.0.0.1:3000`; preserve Origin. `CORS_ORIGIN` do backend
precisa conter exatamente a origem do navegador. Opções em `.env.example`.
Refresh token fica no cookie HttpOnly; o access token fica só em memória. Recarregar
restaura a sessão; logout remove o cookie no servidor.

`npm run check:web` (na raiz) verifica format/lint/typecheck/build e testes de unidade/componentes.
`npm run test:e2e` verifica a aplicação real em Chromium com mocks desativados e
PostgreSQL de teste. Detalhes em [integration-mvp.md](../docs/integration-mvp.md).

Em hospedagem futura, encaminhe `/api` ao backend no mesmo site para suportar
SameSite=Strict. O build estático não inclui a API nem substitui o proxy reverso.
