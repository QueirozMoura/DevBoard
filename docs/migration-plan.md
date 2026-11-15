# Plano de migrations incrementais

**Status:** planejado (nenhuma migration nova criada). Cada fase abaixo vira **uma** migration Prisma aditiva, aplicada com `prisma migrate deploy` e coberta por testes de integração antes de seguir para a próxima.

## Princípios de segurança

- **Somente aditivas** (expand): nada de `DROP`/`RENAME` de colunas existentes; mudanças incompatíveis seguem expand → migrar dados → contract em releases separados.
- **Roll-forward**: não escrevemos `down`; correção = nova migration.
- **Sempre `--create-only` + revisão do SQL** antes de aplicar (CHECKs e índices parciais que o Prisma não expressa entram à mão, como na migration inicial).
- Verificação em CI: `prisma migrate deploy` num banco vazio **e** sobre o schema da migration anterior; `prisma migrate diff --from-migrations … --to-schema … --exit-code` para detectar drift.
- Nunca contra banco de produção; desenvolvimento e testes continuam isolados (`*_test`).
- IDs `uuid(7)`, timestamps `timestamptz(3)`, nomes `snake_case` via `@map`, como no padrão atual.

## M2 — `add_projects_and_members` (Fase 2)

```prisma
enum ProjectRole { OWNER MEMBER }

model Project {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String   @db.VarChar(100)
  description String?  @db.VarChar(2000)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  members     ProjectMember[]
  @@map("projects")
}

model ProjectMember {
  projectId String      @map("project_id") @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  role      ProjectRole @default(MEMBER)
  joinedAt  DateTime    @default(now()) @map("joined_at") @db.Timestamptz(3)
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
  @@index([userId])
  @@map("project_members")
}
```

- Criar projeto + membro OWNER na **mesma transação**.
- Invariante "≥ 1 OWNER": garantida no serviço com `SELECT … FOR UPDATE` na linha do projeto (mesmo padrão de lock do refresh); teste de concorrência (dois OWNERs saindo ao mesmo tempo → um recebe 409 `LAST_OWNER`).
- Toda consulta de recurso filtra por `project_members.user_id` (404 para não membros).
- CHECK `length(trim(name)) > 0`.

## M3 — `add_tasks` (Fase 3)

```prisma
enum TaskStatus   { TODO IN_PROGRESS IN_REVIEW DONE }
enum TaskPriority { LOW MEDIUM HIGH URGENT }

model Task {
  id          String       @id @default(uuid(7)) @db.Uuid
  projectId   String       @map("project_id") @db.Uuid
  title       String       @db.VarChar(200)
  description String?      @db.Text           // CHECK length <= 10000
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  assigneeId  String?      @map("assignee_id") @db.Uuid     // onDelete: SetNull
  createdById String?      @map("created_by_id") @db.Uuid   // onDelete: SetNull
  dueDate     DateTime?    @map("due_date") @db.Timestamptz(3)
  position    String       @db.VarChar(64)    // COLLATE "C" (ordem por bytes)
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  @@unique([projectId, status, position])
  @@index([projectId, status, position, id])
  @@index([assigneeId])
  @@map("tasks")
}
```

- `position`: rank fracionário (estilo _fractional indexing_, base 62), implementado em utilitário próprio com testes de propriedade (inserir entre/antes/depois mantém ordem estrita; reequilíbrio da coluna quando o rank passa de 64 chars). `COLLATE "C"` é aplicado no SQL da migration.
- Mover = transação com lock da coluna (`pg_advisory_xact_lock(hash(projectId||status))`); a UNIQUE evita posições duplicadas sob concorrência (retry em `P2002`).
- "Assignee é membro" validado no serviço; ao remover membro, `UPDATE tasks SET assignee_id = NULL` na mesma transação.
- Paginação por cursor sobre `(status_ordinal, position, id)` com cursor assinado (HMAC) para detectar adulteração → `INVALID_CURSOR`.

## M4 — `add_comments` (Fase 4)

`Comment(id, taskId → tasks ON DELETE CASCADE, authorId → users ON DELETE SET NULL, body @db.Text CHECK 1..5000, createdAt, updatedAt)`; índice `(task_id, created_at, id)`. `Task.commentCount` é derivado por `COUNT` (sem coluna denormalizada no MVP).

## M5 — `add_activities` (Fase 4)

`Activity(id, projectId → projects CASCADE, taskId → tasks SET NULL, actorId → users SET NULL, type enum ActivityType, data Jsonb DEFAULT '{}', createdAt)`; índices `(project_id, created_at DESC, id DESC)` e `(task_id)`. Gravada **na mesma transação** da ação (nunca fora). `data` guarda o título da tarefa (sobrevive à exclusão) mas não conteúdo de comentários. Retenção/limpeza fica pós-MVP.

## Sem migration (outras fases)

- Cookie de refresh (ver `refresh-cookie-migration.md`): nenhuma mudança de schema.
- Rate limit: em memória (`@fastify/rate-limit`) enquanto houver uma instância; Redis/Postgres só ao escalar horizontalmente.
- Limpeza de `refresh_tokens` expirados: job SQL idempotente que preserva ancestrais de famílias ainda válidas.

## Ordem e critérios de aceite por fase

1. **1.5**: `/me` corrigido (feito). 2. **M2**: CRUD de projetos/membros + matriz de autorização testada para OWNER, MEMBER e não-membro. 3. **M3**: tarefas, board, move (testes de concorrência e de ordem). 4. **M4/M5**: comentários e atividades. 5. **Hardening**: CORS/cookie, rate limit, helmet, readiness, limpeza, Dockerfile.

Cada fase só é encerrada com: `format:check`, `lint`, `typecheck`, `build`, suíte completa em PostgreSQL real, `openapi.json` regenerado com `x-status` atualizado, e relatório `docs/fase-*.md`.
