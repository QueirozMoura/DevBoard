# Backend MVP — DevBoard

Implementado em `feat/backend-mvp`, a partir de `b042a9b`, em 2026-11-15.
O checkout original estava em `main`, sem outras worktrees registradas; foi criada a branch solicitada no checkout compartilhado. Nenhum arquivo em `web/**` foi alterado. Sem push, merge ou deploy.

## Entregas

- Auth Backend A: cookie HttpOnly, SameSite=Strict, Path=/api/v1/auth, host-only e Secure em produção; Max-Age limitado à validade absoluta. Cookie tem precedência; Origin da allowlist, JSON e Sec-Fetch-Site são verificados no transporte por cookie. Falha de Origin preserva a sessão. Logout/token inválido limpa o cookie. JSON legado permanece temporariamente disponível.
- M2: Project/ProjectMember, OWNER/MEMBER, CRUD, entrada/saída e alteração de papéis. Não membros recebem 404, inclusive em recursos aninhados. Locks no PostgreSQL impedem remoção/rebaixamento concorrente do último OWNER.
- M3: CRUD de tarefas, status, prioridade, responsável, prazo, filtros, consultas limitadas com cursores HMAC vinculados ao usuário/recurso/filtros, board e movimentação por afterTaskId. Servidor calcula ranks decimais opacos de 30 caracteres, usando espaço entre vizinhos; rebalanceia quando o espaço termina. Escritas são serializadas por projeto, entre instâncias. Remover membro limpa responsáveis na mesma transação.
- M4: comentários paginados, edição só pelo autor, exclusão por autor ou OWNER; contagem em tarefas e cascata. Autor removido fica null.
- M5: histórico e ação principal na mesma transação, com dados mínimos documentados. Exclusão de tarefa preserva histórico com taskId null. Reordenar na mesma coluna não gera evento. Falhas no histórico revertem a ação principal.
- Infra: Helmet, limites por IP/e-mail/usuário, Retry-After, readiness PostgreSQL, timeout de conexão/consulta e limpeza horária limitada a 1000 tokens expirados. Ancestrais de famílias ativas são preservados. Dockerfile com estágios, OpenSSL, usuário node e healthcheck; sem migrations no boot. Gerador Prisma com imports .js explícitos para builds independentes do host.
- OpenAPI: operações marcadas implemented, documentação do transporte atual e readiness. Redocly CLI **2.78.0** fixado e integrado ao CI. Nenhuma mudança incompatível; a adição de /ready foi registrada no contrato antes da implementação.

## Validação executada

| Verificação                                              | Resultado real                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm run format:check                                     | Aprovado                                                                                                                                         |
| npm run lint                                             | Aprovado sem relaxar regras                                                                                                                      |
| npm run typecheck                                        | Aprovado                                                                                                                                         |
| npm run build                                            | Aprovado                                                                                                                                         |
| npm run db:validate                                      | Schema válido                                                                                                                                    |
| npm test                                                 | **158 testes, 15 arquivos, todos aprovados**                                                                                                     |
| npm run openapi:validate                                 | OpenAPI 3.1 válido, sem avisos                                                                                                                   |
| npm audit --audit-level=high                             | Exit 0; 9 moderadas nas ferramentas de desenvolvimento                                                                                           |
| npm audit --omit=dev --audit-level=moderate              | Nenhuma vulnerabilidade                                                                                                                          |
| podman build --format docker -t devboard-backend:local . | Imagem construída com geração Prisma dentro do container                                                                                         |
| HTTP real na imagem com NODE_ENV=production              | Readiness, cadastro, login, refresh por cookie, projeto, tarefa, comentário, movimento, board, histórico, exclusão de projeto e logout aprovados |

A suíte usa PostgreSQL real, com duas instâncias da API em cenários concorrentes. Cobertura inclui autorização/404/403, último OWNER, criação e movimentos concorrentes, atribuição concorrente com remoção de membro, ranks esgotados, referências de outro projeto, filtros, cursores adulterados/de outra consulta, continuação após excluir a âncora, validação estrita, campos null, permissões de comentários e rollback com falha forçada na gravação do histórico.

O teste HTTP confirmou Secure/HttpOnly e a composição dos dados em board/histórico. O container temporário foi encerrado e o projeto temporário foi excluído. A UI não foi verificada: o frontend pertence à outra worktree. O CI remoto não foi disparado, pois não houve push.

Foram aplicadas **somente em devboard_test** as migrations de projetos, tarefas, comentários e atividades, além da migration inicial ao preparar/recriar o banco descartável. Nenhum banco de produção foi migrado. NODE_ENV=production é recusado pela configuração local do Prisma.

## Limites e pendências

- Remover o transporte legado de refresh exige confirmação de migração do frontend e a mudança de contrato prevista em refresh-cookie-migration.md. A compatibilidade foi mantida deliberadamente nesta entrega.
- Rate limits são por instância, em memória. Um teto global em cluster exige armazenamento compartilhado. Contadores reiniciam quando o processo reinicia.
- TLS termina no proxy; CORS_ORIGIN explícito com HTTPS é obrigatório em produção. SameSite=Strict exige frontend e API no mesmo site. trustProxy está desativado; configurar proxies confiáveis e IP real antes de habilitá-lo.
- Permanecem 9 advisories moderados transitivos na cadeia ESLint/TypeScript-ESLint/minimatch. Não foi aplicado audit fix --force com downgrade incompatível. Produção está sem vulnerabilidades reportadas.
- A limpeza remove até 1000 tokens por hora por instância; acompanhar backlog e ajustar o lote/intervalo conforme o volume.

## Arquivos alterados

Lista relativa à base b042a9b, incluindo este relatório:

```text
.dockerignore
.env.example
.github/workflows/ci.yml
Dockerfile
README.md
docs/api-contract.md
docs/backend-mvp.md
docs/fase-1.4.md
docs/refresh-cookie-migration.md
openapi.json
package-lock.json
package.json
prisma.config.ts
prisma/migrations/20261115180000_projects/migration.sql
prisma/migrations/20261115181000_tasks/migration.sql
prisma/migrations/20261115182000_comments/migration.sql
prisma/migrations/20261115183000_activities/migration.sql
prisma/schema.prisma
redocly.yaml
scripts/openapi.ts
src/app.ts
src/config/env.ts
src/modules/activities/activities.ts
src/modules/auth/auth.cleanup.ts
src/modules/auth/auth.routes.ts
src/modules/auth/auth.session.ts
src/modules/comments/comments.routes.ts
src/modules/health/health.routes.ts
src/modules/projects/projects.routes.ts
src/modules/shared/core.ts
src/modules/tasks/tasks.routes.ts
src/plugins/authentication.ts
src/plugins/errors.ts
src/plugins/hardening.ts
src/plugins/prisma.ts
src/server.ts
tests/helpers/api.ts
tests/integration/activities.test.ts
tests/integration/comments.test.ts
tests/integration/cookie.test.ts
tests/integration/hardening.test.ts
tests/integration/projects.test.ts
tests/integration/session.test.ts
tests/integration/tasks.test.ts
vitest.config.ts
```

## Commits locais por fase

```text
3c25187 feat(auth): add refresh cookie with origin checks and legacy compatibility
2735e31 feat(projects): implement membership CRUD and serialized owner authorization
7b78fb9 feat(tasks): add kanban CRUD filters and atomic server-ranked moves
3651486 feat(comments): enforce author permissions and expose transactional comment counts
52a390f feat(activities): record mutations atomically and add filtered project history
96705ea fix(api): bound cursor queries and serialize reads with membership changes
192d16b feat(infra): harden API limits readiness session cleanup and container runtime
4e55ea9 ci(api): validate OpenAPI 3.1 with pinned Redocly CLI
a088a38 fix(container): generate Prisma with explicit JavaScript imports
```

A documentação e este relatório são registrados em um commit local adicional.
