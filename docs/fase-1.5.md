# Relatório — Fase 1.5: Perfil (`/me`) e contrato da API

## Problema encontrado

As rotas `GET/PATCH /api/v1/me` (commit `bc52f56`) estavam registradas dentro do plugin de autenticação, que tem prefixo `/api/v1/auth`. O caminho real era `/api/v1/auth/api/v1/me`, então `/api/v1/me` respondia 404 e 5 testes de perfil falhavam. O teste de perfil também não estava versionado e o código não passava em `format:check`/`lint`.

## Correções

| Arquivo                                        | Alteração                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/users/users.routes.ts`            | Novo módulo registrado com prefixo `/api/v1`; `GET/PATCH /me` com schema de resposta, `no-store` e tradução de `P2002`/`P2025`.        |
| `src/modules/users/users.schema.ts`            | `profilePatchSchema` (movido de `auth`, mesma validação estrita).                                                                      |
| `src/modules/auth/auth.routes.ts`/`.schema.ts` | Rotas e schema de perfil removidos do módulo de autenticação.                                                                          |
| `src/plugins/errors.ts`                        | `AppError` aceita mensagem opcional (perfil responde "Dados inválidos" em vez de "Dados de cadastro inválidos"; o cadastro não mudou). |
| `src/app.ts`                                   | Registro de `usersRoutes`.                                                                                                             |
| `tests/integration/profile.test.ts`            | Tipagem das respostas (3 erros de lint). No teste de concorrência de e-mail, o segundo usuário passou a ser cadastrado pela API.       |

Sobre o teste de concorrência: ele usava "Bia", criada no `beforeEach` com `passwordHash: 'hash interno'` (sentinela para provar que hashes não vazam). Ela não consegue fazer login, então o teste enviava `Bearer undefined` e recebia 401. A asserção (`[200, 409]` + exatamente 1 usuário com o e-mail) e a sentinela foram mantidas; a corrida agora é Ana × Carla (usuária real cadastrada via `/register`). Nenhuma asserção foi removida ou afrouxada.

## Contrato

`docs/api-contract.md`, `openapi.json` (OpenAPI 3.1, gerado de `scripts/openapi.ts`), `docs/refresh-cookie-migration.md`, `docs/migration-plan.md`. `tests/integration/openapi.test.ts` (6 testes) garante sincronismo gerador↔arquivo, `$ref` resolvíveis, `operationId` únicos, parâmetros de caminho, `required ⊆ properties`, 2xx por operação, `x-status` ≡ rotas registradas e inexistência do caminho legado.

## Verificações

| Verificação                   | Resultado                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `npm run format:check`        | Aprovado                                                                      |
| `npm run lint`                | Aprovado                                                                      |
| `npm run typecheck`           | Aprovado                                                                      |
| `npm run build`               | Aprovado                                                                      |
| `npm run db:migrate:test`     | Sem migrations pendentes (PostgreSQL 18 real, `_test`)                        |
| `npm test`                    | **135 aprovados em 9 arquivos** (124 anteriores + 5 de perfil + 6 de OpenAPI) |
| `profile.test.ts` repetido 3× | 5/5 nas três execuções (sem flakiness)                                        |

## Limitações

- O `openapi.json` **não** foi validado por um validador OpenAPI de terceiros (a execução de `npx @redocly/cli` não fixado foi bloqueada). A validação é estrutural, feita pelos testes acima. Recomenda-se adicionar um validador com versão fixada como devDependency e um passo no CI.
- Rotas de projetos/tarefas/comentários/atividades estão no contrato (`x-status: planned`), sem implementação. O cookie HttpOnly está só desenhado.
- Sem rate limiting, CORS, readiness nem limpeza de tokens (planejados na Fase de hardening).
- Alterações não commitadas (nenhum commit, push ou deploy foi feito).
