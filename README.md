# DevBoard

API REST de gerenciamento de projetos e tarefas (estilo Jira/Trello), construída como projeto de portfólio.

**Status:** Fase 1.1 — Prisma + PostgreSQL (modelos `User` e `RefreshToken`, migration inicial). Autenticação, projetos e tarefas virão nas próximas fases.

## Stack

Node.js (TypeScript strict) · Fastify 5 · Zod 4 · Vitest · ESLint + Prettier · PostgreSQL (via Podman) · GitHub Actions.
Prisma 7.10.1 (`@prisma/adapter-pg`). Argon2, JWT e Swagger entram nas fases em que forem necessários.

## Pré-requisitos

- Node.js ≥ 24.11 (desenvolvido em 26; veja `.nvmrc`) e npm ≥ 11
- Podman e podman-compose (para o PostgreSQL local)

## Como executar

```bash
npm ci
cp .env.example .env        # ajuste a senha do banco
npm run db:up               # sobe PostgreSQL dev (5432) e teste (5433)
npm run db:migrate:deploy   # aplica as migrations no banco de DESENVOLVIMENTO
npm run db:migrate:test     # aplica as migrations no banco de TESTES
npm run dev                 # http://127.0.0.1:3000
curl http://127.0.0.1:3000/health
```

## Scripts

| Script                          | O que faz                                 |
| ------------------------------- | ----------------------------------------- |
| `npm run dev`                   | Servidor com reload (tsx watch)           |
| `npm run build` / `npm start`   | Compila para `dist/` / executa o build    |
| `npm run lint` · `format:check` | ESLint (strict, type-checked) · Prettier  |
| `npm run typecheck`             | `tsc --noEmit`                            |
| `npm test` · `test:coverage`    | Vitest                                    |
| `npm run db:up` · `db:down`     | Sobe/derruba os bancos via podman-compose |

## Arquitetura inicial

```
src/
  app.ts          buildApp(env): monta o Fastify sem escutar porta (testável via app.inject)
  server.ts       entrypoint: listen + encerramento gracioso (SIGINT/SIGTERM)
  config/env.ts   variáveis de ambiente validadas com Zod (falha rápida no boot)
  plugins/        preocupações transversais (tratamento de erros)
  modules/        um diretório por domínio (hoje: health)
tests/
  unit/ · integration/
```

## Decisões técnicas

- **TypeScript 6.0.3 (e não 7.x):** o TS 7 é o `latest` no npm, mas `typescript-eslint@8.72.1` declara `typescript <6.1.0` como peer dependency; usar o 7 quebraria o lint com tipos. Reavaliar quando o typescript-eslint suportar o TS 7.
- **Isolamento do banco de testes:** instância separada (`db_test`, porta 5433, tmpfs). O Vitest força `DATABASE_URL` para ela e `loadEnv()` recusa, em `NODE_ENV=test`, qualquer banco cujo nome não termine em `_test`.
- **Prisma 7 com adapter `pg`:** `prisma.config.ts` define a URL do banco; o client é gerado em `src/generated/prisma` (ignorado pelo Git) e instanciado uma vez em `plugins/prisma.ts` (`app.prisma`), com `$disconnect()` em `app.close()`. Sem camada de repositório separada.
- **Prisma 7.10.1 (série `prev`):** a tag `latest` do npm aponta para 8.0.0-rc; fixamos a última 7.x estável, com `prisma`, `@prisma/client` e `@prisma/adapter-pg` na mesma versão.
- **Migrations seguras por alvo:** `prisma.config.ts` usa `DATABASE_URL` por padrão (recusa banco `*_test`) e `TEST_DATABASE_URL` com `PRISMA_TARGET=test` (exige banco `*_test`). O CI aplica as migrations em um Postgres de serviço.
- **Constraints no SQL da migration:** `users.email` em minúsculas e `refresh_tokens.expires_at > created_at` (CHECKs que o Prisma não expressa); IDs UUID v7 no Postgres (`uuid`), timestamps `timestamptz`.
- **Logs estruturados** com pino (embutido no Fastify), com `authorization`/`cookie` redigidos.
- **Variáveis de ambiente** carregadas com `--env-file-if-exists` do Node (sem dotenv).
- **Podman:** `compose.yaml` usa nomes de imagem totalmente qualificados e publica portas só em `127.0.0.1`.
