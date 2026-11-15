# Contrato da API REST — DevBoard (v1, rascunho estável)

Fonte de verdade legível por máquina: [`openapi.json`](../openapi.json), gerado de `scripts/openapi.ts` (`npm run openapi:generate`). Este documento explica as regras que o schema não expressa. Em conflito, **o `openapi.json` prevalece**; um teste (`tests/integration/openapi.test.ts`) impede divergência entre o JSON, o gerador e as rotas realmente registradas.

## 1. Estado dos contratos (para o frontend)

| Grupo                | Rotas                                                              | Servidor  | Uso pelo frontend                                                |
| -------------------- | ------------------------------------------------------------------ | --------- | ---------------------------------------------------------------- |
| Infra                | `GET /health`                                                      | pronto    | real                                                             |
| Auth                 | `POST /api/v1/auth/{register,login,refresh,logout}`                | pronto    | real. **Transporte do refresh muda** (§3): siga o contrato final |
| Perfil               | `GET/PATCH /api/v1/me`                                             | pronto    | real                                                             |
| Projetos, membros    | `/api/v1/projects…`                                                | planejado | **mock** — contrato estável                                      |
| Tarefas, board, move | `/api/v1/projects/{id}/{board,tasks}`, `/api/v1/tasks/{id}[/move]` | planejado | **mock** — contrato estável                                      |
| Comentários          | `/api/v1/tasks/{id}/comments`, `/api/v1/comments/{id}`             | planejado | **mock** — contrato estável                                      |
| Atividades           | `GET /api/v1/projects/{id}/activities`                             | planejado | **mock** — contrato estável                                      |

"Estável" significa: mudanças incompatíveis exigem aviso explícito e atualização deste documento; mudanças compatíveis (campos novos opcionais na resposta) podem ocorrer — o cliente deve **ignorar campos desconhecidos**. Cada operação tem `x-status` (`implemented`/`planned`) e `x-required-role`.

## 2. Convenções gerais

- **Base**: `/api/v1`. JSON UTF-8. IDs: UUID v7. Datas: ISO 8601 UTC (`2026-11-15T17:00:00.000Z`).
- **Autenticação**: `Authorization: Bearer <accessToken>` (JWT HS256, 15 min). Nunca em query/cookie.
- **Corpos estritos**: campos desconhecidos → `400 VALIDATION_ERROR`. Strings sofrem `trim`; e-mails são normalizados para minúsculas.
- **PATCH**: parcial; ao menos um campo; `null` limpa campos anuláveis (`description`, `assigneeId`, `dueDate`).
- **Cache**: respostas de auth/perfil enviam `Cache-Control: no-store`.
- **Concorrência**: último-que-escreve-vence (sem ETag no MVP).

### Formato de erro

```json
{ "error": "FORBIDDEN", "message": "Texto genérico" }
```

`VALIDATION_ERROR` nos novos endpoints (projetos/tarefas/comentários) acrescenta `details: [{ "path": "title", "message": "..." }]`. Os endpoints de autenticação **não** enviam `details` (evita enumeração). **Decida pelo campo `error`, nunca por `message`.**

| `error`                  | HTTP | Quando                                                                                  |
| ------------------------ | ---- | --------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Corpo/params inválidos (em `/auth/register` a mensagem é "Dados de cadastro inválidos") |
| `LOGIN_VALIDATION_ERROR` | 400  | Corpo de login inválido                                                                 |
| `INVALID_CURSOR`         | 400  | `cursor` adulterado ou de outra consulta                                                |
| `UNAUTHORIZED`           | 401  | Access token ausente/inválido/expirado (`WWW-Authenticate: Bearer`) → faça refresh      |
| `USER_NOT_FOUND`         | 401  | Token válido de usuário removido → trate como sessão encerrada                          |
| `INVALID_CREDENTIALS`    | 401  | Login                                                                                   |
| `INVALID_REFRESH_TOKEN`  | 401  | Refresh/logout: ausente, expirado, reutilizado → exige novo login                       |
| `FORBIDDEN`              | 403  | Membro sem papel suficiente                                                             |
| `CSRF_ORIGIN_REJECTED`   | 403  | Refresh/logout com `Origin` ausente/não permitido (versão com cookie)                   |
| `NOT_FOUND`              | 404  | Recurso inexistente **ou projeto do qual o usuário não é membro**                       |
| `INVITEE_NOT_FOUND`      | 404  | `POST …/members` com e-mail sem conta                                                   |
| `EMAIL_ALREADY_EXISTS`   | 409  | Cadastro ou troca de e-mail                                                             |
| `ALREADY_MEMBER`         | 409  | Usuário já é membro                                                                     |
| `LAST_OWNER`             | 409  | Remover/rebaixar o único OWNER                                                          |
| `INVALID_ASSIGNEE`       | 422  | `assigneeId` não é membro do projeto                                                    |
| `INVALID_MOVE_TARGET`    | 422  | `afterTaskId` fora da coluna de destino ou igual à própria tarefa                       |
| `RATE_LIMITED`           | 429  | Cabeçalho `Retry-After` (segundos)                                                      |
| `INTERNAL_ERROR`         | 500  | Genérico                                                                                |
| `FST_*`                  | 4xx  | Erros de transporte (JSON malformado, tipo de mídia), mensagem "Requisição inválida"    |

### Paginação (cursor)

`?limit=1..100` (padrão 20) e `?cursor=<opaco>`. Resposta: `{ "items": [...], "nextCursor": "..." | null }`. `nextCursor: null` = fim. O cursor é opaco, vinculado à consulta (filtros/ordem) e **não deve ser construído nem alterado** pelo cliente. Ordenação de cada lista está na descrição da operação. Não há `total` (exceto `taskCount`/`memberCount` em `Project` e `total` por coluna do board).

### Limites de taxa (planejado, Fase 5)

Endpoints `/auth/*`: 10 req/min por IP (login também por e-mail). Demais: 300 req/min por usuário. Excesso → `429 RATE_LIMITED` + `Retry-After`.

## 3. Autenticação, sessão e CSRF

Resumo do contrato final (detalhes e plano de transição em [`refresh-cookie-migration.md`](refresh-cookie-migration.md)):

- `accessToken` (JWT) vive **apenas em memória** no cliente e vai em `Authorization`.
- `refreshToken` é um cookie `refresh_token` **HttpOnly, SameSite=Strict, Path=/api/v1/auth, Secure em produção**, inacessível ao JavaScript. O corpo das respostas deixa de conter `refreshToken`.
- O cliente chama `POST /auth/refresh` com `credentials: 'include'` e corpo `{}`: ao carregar a página (restaura a sessão sem novo login) e ao receber `401 UNAUTHORIZED`. Mantenha **uma única** chamada de refresh em andamento e reaproveite-a nas requisições concorrentes; repetir o token antigo revoga a sessão.
- `INVALID_REFRESH_TOKEN` ⇒ sessão encerrada: limpe o estado e vá para o login.
- Fluxo de logout: `POST /auth/logout` (`credentials: 'include'`), `204`, e o cookie é limpo.
- **Durante a transição** as respostas ainda trazem `refreshToken` no corpo (marcado `deprecated`); o frontend **não deve** armazená-lo nem usá-lo.

## 4. Autorização (OWNER / MEMBER)

Cada projeto tem membros com papel `OWNER` ou `MEMBER`. Há sempre ao menos um OWNER.

| Ação                                                          |     MEMBER     |           OWNER           |
| ------------------------------------------------------------- | :------------: | :-----------------------: |
| Ver projeto, membros, board, tarefas, comentários, atividades |       ✔        |             ✔             |
| Criar/editar/mover tarefas, comentar                          |       ✔        |             ✔             |
| Excluir tarefa                                                | só a que criou |             ✔             |
| Editar/excluir o próprio comentário (editar: só o autor)      |       ✔        |  ✔ (excluir qualquer um)  |
| Sair do projeto (`DELETE …/members/{meuId}`)                  |       ✔        | ✔ (se houver outro OWNER) |
| Editar/excluir projeto                                        |       ✘        |             ✔             |
| Adicionar/remover membros, alterar papéis                     |       ✘        |             ✔             |

- Usuário **não membro** recebe `404 NOT_FOUND` em qualquer recurso do projeto (não revela existência). Membro sem papel suficiente recebe `403 FORBIDDEN`.
- Recursos aninhados (`/tasks/{id}`, `/comments/{id}`) são resolvidos para o projeto antes da checagem; mesmo comportamento 404/403.
- `assigneeId` precisa ser membro (`422 INVALID_ASSIGNEE`). Remover um membro deixa suas tarefas sem responsável.
- Excluir projeto remove tarefas, comentários e atividades (cascata, irreversível).

## 5. Modelos de resposta

Ver `components.schemas` no `openapi.json`. Pontos de atenção:

- **`Project`**: inclui `myRole` (papel do usuário atual), `memberCount`, `taskCount`.
- **`Task`**: `status` ∈ `TODO | IN_PROGRESS | IN_REVIEW | DONE`; `priority` ∈ `LOW | MEDIUM | HIGH | URGENT` (padrão `MEDIUM`); `position` é um rank textual **opaco** — ordene por `(status, position)` comparando strings por ordem de bytes e nunca o calcule.
- **`Comment.author`** e **`Activity.actor`** são `null` se o usuário foi removido.
- **`Member`** expõe `name` e `email` dos colegas de projeto (necessário para a UI de membros).

### Kanban e movimentação

- `GET /projects/{id}/board` devolve sempre as 4 colunas (ordem fixa), cada uma com até `limitPerColumn` (padrão 50) tarefas, `total`, `hasMore` e `nextCursor`. Para carregar mais de uma coluna use `GET …/tasks?status=X&cursor=…`.
- `POST /tasks/{id}/move` com `{ "status"?: "...", "afterTaskId": "uuid" | null }`:
  - `afterTaskId` = tarefa que ficará **imediatamente acima** na coluna de destino; `null` = topo; para o fim da coluna envie o id da última tarefa.
  - A operação é atômica e devolve a `Task` com o novo `status` e `position`. Atualize a UI de forma otimista e reconcilie com a resposta; em erro, reverta e recarregue o board.
  - Concorrência: o servidor insere ao lado de `afterTaskId` no estado atual; se esse alvo foi movido/excluído entre a leitura e a escrita → `422 INVALID_MOVE_TARGET` (recarregue o board).
- `PATCH /tasks/{id}` não aceita `status`/`position`.

### Atividades

Somente leitura, geradas pelo servidor na mesma transação da ação. `data` por tipo:

| `type`                               | `data`                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `PROJECT_CREATED`, `PROJECT_UPDATED` | `{ "changes": ["name", "description"] }` (só no UPDATED)           |
| `MEMBER_ADDED`, `MEMBER_REMOVED`     | `{ "userId", "name", "role" }`                                     |
| `MEMBER_ROLE_CHANGED`                | `{ "userId", "name", "from", "to" }`                               |
| `TASK_CREATED`, `TASK_DELETED`       | `{ "title" }` (`taskId` fica `null` após exclusão)                 |
| `TASK_UPDATED`                       | `{ "title", "changes": ["priority", "assigneeId"] }`               |
| `TASK_MOVED`                         | `{ "title", "from": "TODO", "to": "DONE" }` (só se a coluna mudou) |
| `COMMENT_ADDED`                      | `{ "title", "commentId" }`                                         |

Reordenar dentro da mesma coluna **não** gera atividade. Atividades não guardam o texto de comentários nem descrições.

## 6. Validação do arquivo

```bash
npm run openapi:generate        # regenera openapi.json a partir de scripts/openapi.ts
npx vitest run tests/integration/openapi.test.ts
```

O teste verifica: sincronismo gerador↔arquivo, `$ref`s resolvíveis, `operationId` únicos, parâmetros de caminho declarados, `required` ⊆ `properties`, ao menos uma resposta 2xx por operação e que `x-status: implemented` coincide exatamente com as rotas registradas no Fastify. Não substitui um validador OpenAPI completo (ver pendências no relatório da fase).
