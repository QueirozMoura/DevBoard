# Integração MVP — DevBoard

Integração local concluída em `feat/integration-mvp`, em 2026-11-15.

## Estado inicial e estratégia

As duas worktrees estavam limpas, sem alterações rastreadas ou arquivos não rastreados pendentes:

- `DevBoard`: `feat/backend-mvp` em `e8c682c`.
- `DevBoard-frontend`: `feat/frontend-mvp` em `42d7ce7`.
- `main`: `b042a9b`.
- A branch de integração não existia.

Criada `feat/integration-mvp` a partir de `feat/backend-mvp`, seguida de merge com
`--no-ff` de `feat/frontend-mvp`. O merge `f4a8865` tem os pais `e8c682c` e `42d7ce7`:
os dois históricos são ancestrais da integração. Não houve conflitos nem alterações
inesperadas. Nenhuma funcionalidade precisou ser removida para integrar.

O checkout `DevBoard` agora está na branch de integração. A worktree `DevBoard-frontend`
permanece limpa em `42d7ce7`. As branches originais e `main` mantiveram os mesmos commits;
nenhuma branch/worktree foi apagada. Sem push, deploy ou merge em main.

## Recursos confirmados

O contrato OpenAPI continua válido e sincronizado com o backend. São **29 operações
implementadas**, sem operações planejadas:

| Grupo                         | Operações implementadas |
| ----------------------------- | ----------------------- |
| Infra                         | 2                       |
| Autenticação                  | 4                       |
| Perfil                        | 2                       |
| Projetos                      | 5                       |
| Membros                       | 4                       |
| Tarefas, board e movimentação | 7                       |
| Comentários                   | 4                       |
| Atividades                    | 1                       |

O frontend integrado usa a API real por padrão em desenvolvimento e produção.
`VITE_MOCKS=none` é o exemplo recomendado; mocks continuam disponíveis apenas por
configuração explícita para demonstração/testes. Não existe fallback automático para
mocks quando a API falha. Os testes de componentes mantêm suas simulações explícitas.

O proxy Vite preserva Origin e encaminha `/api`, `/health` e `/ready`. Frontend e API
funcionam no mesmo origin do navegador durante desenvolvimento. Refresh usa cookie
HttpOnly/SameSite=Strict e access token somente em memória; o frontend ignora o campo
refreshToken legado. As proteções e o contrato compatível do backend foram preservados.

## Validação executada

**`npm run check` concluiu com exit 0.**

| Check                                             | Resultado                               |
| ------------------------------------------------- | --------------------------------------- |
| Backend format, lint, typecheck, build            | Aprovados                               |
| OpenAPI 3.1/Redocly 2.78.0                        | Válido, sem avisos de contrato          |
| Backend Vitest com PostgreSQL real                | **158 testes em 15 arquivos aprovados** |
| Frontend format, lint, typecheck, build           | Aprovados                               |
| Frontend Vitest/jsdom                             | **102 testes em 15 arquivos aprovados** |
| Chromium/Playwright 1.65.1, API real e PostgreSQL | **2 E2E aprovados**, sem retries        |
| Verificação dos ancestrais backend/frontend       | Ambos preservados                       |
| Worktree frontend original                        | Limpa, branch/commit preservados        |

O typecheck inclui separadamente os testes de navegador, sem adicionar tipos DOM ao
backend. A formatação e o lint do frontend usam suas próprias configurações; o comando
consolidado verifica ambos os projetos.

### Fluxo real no navegador

Os E2E sobem API em `127.0.0.1:3101` e Vite em `127.0.0.1:5174`, com
`VITE_MOCKS=none`, `VITE_API_URL` vazio e proxy para essa API. Servidores já existentes
não são reutilizados.

| Fronteira                  | Evidência aprovada                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Tela → cadastro/login      | Formulários enviados à API real; conta criada e login concluído                           |
| Cookie → restauração       | Cookie HttpOnly, SameSite Strict e Path conferidos; reload restaura sessão                |
| Tela → projeto/tarefa      | POSTs retornam 201 e recursos aparecem no board                                           |
| Tela → comentário          | POST retorna 201 e texto aparece no painel                                                |
| Tela → movimentação        | Select muda coluna para DONE e o board reconcilia                                         |
| Arraste Kanban → API       | Mouse arrasta cartão; POST move envia status IN_PROGRESS e afterTaskId null; resposta 200 |
| API → PostgreSQL           | Consulta Prisma confirma status, corpo do comentário e 4 atividades do fluxo              |
| PostgreSQL → UI            | Histórico mostra comentário e movimentação reais após reload                              |
| Logout → sessão encerrada  | Resposta 204, cookie removido e reload continua no login                                  |
| Console                    | Nenhum pageerror no fluxo completo                                                        |
| Armazenamento do navegador | Nenhum token em localStorage/sessionStorage                                               |

O executor ignora DATABASE_URL para escolher o banco e usa TEST_DATABASE_URL com
NODE_ENV=test; a configuração recusa nomes de banco sem sufixo `_test`. Migrations
foram verificadas somente em `devboard_test` e não havia migrations pendentes. Nenhuma
migration foi executada no banco de desenvolvimento ou produção nesta integração.
Os E2E removem somente suas contas/projetos temporários, sem truncar outras tabelas.

## Executar e verificar novamente

Guia do frontend: [web/README.md](../web/README.md). Ambiente: [web/.env.example](../web/.env.example).

```bash
npm ci
npm ci --prefix web
npm run db:up
npm run db:migrate:test
npx playwright install chromium
npm run check
```

Em desenvolvimento, após configurar o .env e migrar o banco de desenvolvimento local,
execute `npm run dev` e `npm --prefix web run dev` em terminais separados. Abra
`http://localhost:5173`, compatível com o CORS_ORIGIN padrão. Se mudar host/porta,
ajuste a allowlist à origem exata. Evite misturar localhost e 127.0.0.1.

Os relatórios Playwright ficam em `playwright-report/`; traces/screenshots de falhas
ficam em `test-results/`. Ambos são ignorados pelo Git. O CI foi configurado para
instalar as dependências dos dois projetos, verificar ambos e executar Chromium com
PostgreSQL de teste. Artefatos de falhas serão anexados pelo CI. O CI remoto não foi
executado, pois nenhum push foi feito.

## Commits de integração

- `f4a8865` — merge: integrate frontend MVP with backend MVP.
- `2ebcfeb` — fix(integration): use real API by default and isolate frontend checks.
- `553802d` — test(integration): verify real browser API and PostgreSQL flows in CI.
- Commit adicional de documentação registra este relatório e os guias de execução.

## Limitações e pendências

Nenhum bloqueio funcional encontrado nos fluxos solicitados.

- O build do frontend passa com aviso de chunk JavaScript de **511,43 kB** minificado
  (157,80 kB gzip). Divisão por rotas pode reduzir o carregamento inicial em trabalho futuro.
- Esta execução E2E cobre Chromium desktop. Firefox, WebKit e dispositivos móveis não
  foram executados nesta integração.
- O transporte legado de refresh continua disponível conforme o contrato aprovado;
  removê-lo exige a migração de contrato documentada. O frontend já usa somente cookies.
- Limitações operacionais do backend (rate limit por instância, configuração de TLS/proxy
  e advisories moderados de ferramentas) seguem documentadas em [backend-mvp.md](backend-mvp.md).
- O build estático do frontend ainda exige proxy reverso para `/api` em uma hospedagem
  futura no mesmo site. Nenhuma publicação ou configuração de hospedagem foi realizada.
