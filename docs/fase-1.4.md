# Relatório — Fase 1.4: Refresh Token e Logout

## Escopo e arquitetura

A inspeção confirmou a Fase 1.3 no código: login com verificação Argon2id, emissão de JWT HS256 com validade de 15 minutos e hook `app.authenticate` que valida assinatura, algoritmo, tipo, expiração, issuer, audience e claims obrigatórias. Os testes exercitam uma rota protegida exclusiva da suíte, incluindo rejeição antes de executar seu handler. Não há endpoint de perfil publicado.

Foi preservada a organização Fastify → módulos de domínio → Prisma/PostgreSQL, com Zod estrito, tratamento centralizado de erros, serialização por lista de campos permitidos e logs sem conteúdo sensível. A tabela `refresh_tokens`, criada anteriormente, atende à fase sem mudança de schema ou nova migration. Alterações locais já existentes foram preservadas e revisadas.

## Entrega e rotação

- Login retorna `accessToken`, `refreshToken` e os dados públicos do usuário.
- O refresh token contém 32 bytes de aleatoriedade criptográfica (`randomBytes`), em base64url canônico. Somente seu hash SHA-256 é armazenado no PostgreSQL.
- Cada login cria uma família independente. A validade absoluta é de sete dias, mantida em todas as rotações.
- `POST /api/v1/auth/refresh` recebe `{ "refreshToken": "..." }` e retorna um novo par de tokens. O anterior recebe `revokedAt` e `replacedById`.
- A transação `READ COMMITTED` obtém um advisory lock transacional por família e relê o estado após adquirir o lock. Refresh e logout compartilham esse mecanismo entre instâncias da API.
- Reutilizar qualquer ancestral revogado confirma a revogação da família antes de retornar `401`. Outras sessões do mesmo usuário continuam ativas.
- Refresh simultâneo do mesmo token produz um único sucessor; as outras chamadas detectam reuso e revogam também esse sucessor. Não há tolerância para repetição do token anterior.
- `POST /api/v1/auth/logout` recebe o mesmo corpo e revoga a família correspondente, retornando `204`. Aceita ancestrais conhecidos e é repetível, inclusive para sessão expirada. Tokens desconhecidos ou malformados retornam `401`.
- Token inválido, expirado ou revogado recebe erro genérico de sessão; JSON malformado recebe `400` sem ecoar o conteúdo. Falhas inesperadas retornam `500` genérico e não consomem o token quando a transação falha.
- Respostas de autenticação usam `Cache-Control: no-store`. Corpos, respostas, credenciais, tokens e mensagens brutas de erros não são registrados nos logs dos fluxos verificados.

## Contrato do cliente e CSRF

Os tokens são entregues exclusivamente por JSON, sem cookies, e exigem HTTPS fora do desenvolvimento local. No navegador, ambos devem ficar somente em memória; recarregar a página exige novo login. Não usar localStorage, sessionStorage, IndexedDB, URLs ou logs. Clientes nativos podem usar armazenamento seguro do sistema operacional.

O cliente substitui o par após cada refresh e elimina os tokens após logout ou `401` de refresh. Deve coordenar uma única chamada de refresh compartilhada, inclusive entre consumidores concorrentes. Cookies, query e Authorization não substituem o corpo do refresh/logout.

Não há credencial anexada automaticamente pelo navegador, nem CORS habilitado. O contrato sem cookies não exige token anti-CSRF. Uma futura alteração para cookies precisará implementar as proteções correspondentes. Armazenamento em memória não impede acesso por JavaScript malicioso; o cliente futuro precisa mitigar XSS.

## Arquivos alterados ou adicionados

| Arquivo                             | Alteração                                                            |
| ----------------------------------- | -------------------------------------------------------------------- |
| `src/modules/auth/auth.session.ts`  | Geração, hash, criação de sessão, lock, rotação e revogação.         |
| `src/modules/auth/auth.routes.ts`   | Integração ao login, refresh/logout, serialização e no-store.        |
| `src/modules/auth/auth.schema.ts`   | Validação estrita do refresh token canônico.                         |
| `src/plugins/errors.ts`             | Erro genérico `INVALID_REFRESH_TOKEN`.                               |
| `tests/integration/login.test.ts`   | Contrato com os dois tokens e preservação da cobertura JWT anterior. |
| `tests/integration/session.test.ts` | Integração com banco real e duas instâncias da aplicação.            |
| `README.md`                         | Endpoints, armazenamento, concorrência, segurança e limitações.      |
| `docs/fase-1.4.md`                  | Este relatório persistente.                                          |

## Testes e verificações

**124 testes em sete arquivos: 102 anteriores preservados e 22 de sessões.** A suíte usa PostgreSQL 18 real via Podman, banco isolado `devboard_test`, e aplica a migration existente pelo comando `npm run db:migrate:test`. Nenhum mock substitui o PostgreSQL nos cenários de rotação e concorrência.

Cobertura: login com ambos os tokens; armazenamento exclusivo do hash; refresh válido; expiração absoluta; invalidação do anterior; reuso e revogação de toda a família; isolamento entre sessões; logout atual/ancestral/expirado e refresh posterior; tokens inválidos; JSON malformado; rejeição de cookies/query; refresh simultâneo entre duas instâncias; logout concorrente com refresh; falha de assinatura; ausência de segredos nos logs; JWT renovado aceito pelo hook existente e refresh token recusado como access token.

| Verificação               | Resultado                              |
| ------------------------- | -------------------------------------- |
| `npm run db:migrate:test` | Aprovada no PostgreSQL real de testes. |
| `npm run lint`            | Aprovado.                              |
| `npm run typecheck`       | Aprovado.                              |
| `npm test`                | 124 aprovados, sem testes ignorados.   |
| `npm run build`           | Aprovado.                              |
| `npm run format:check`    | Aprovado.                              |
| `git diff --check`        | Aprovado.                              |

Na preparação, os testes inicialmente falharam por indisponibilidade da conexão com o banco. Os containers foram iniciados por `npm run db:up` e a migration aplicada somente ao banco de testes; as verificações finais usam esse banco real disponível.

## Limitações e encerramento

- JWTs já emitidos permanecem válidos até expirar, por até 15 minutos após logout/reuso; a autenticação de rotas continua stateless.
- Perder a resposta de uma rotação e repetir o token antigo revoga a família e exige novo login.
- Não há rate limiting nem limpeza automática de registros expirados. Ancestrais precisam ser preservados enquanto houver sessão válida para manter a detecção de reuso.
- O contrato de armazenamento está documentado; não há frontend nesta fase.

Fase 1.4 encerrada. Não foram implementados endpoints de perfil, alterações em projetos/tarefas ou itens da Fase 1.5. Nenhum commit, push, uso de sudo ou alteração do Fedora foi realizado.
