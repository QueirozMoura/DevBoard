# DevBoard

API REST de gerenciamento de projetos e tarefas (estilo Jira/Trello), construída como projeto de portfólio.

**Status:** MVP integrado em `feat/integration-mvp`: backend M2–M5 e frontend React/Vite com API real por padrão. Cadastro/login, projetos, tarefas/Kanban, comentários e atividades verificados em Chromium com PostgreSQL real de teste. Guia: [integração](docs/integration-mvp.md).

Relatórios: [Fase 1.4](docs/fase-1.4.md) · [Fase 1.5](docs/fase-1.5.md).

**Contrato da API (frontend e backend):** [docs/api-contract.md](docs/api-contract.md) e [`openapi.json`](openapi.json) (gerado por `npm run openapi:generate`). Plano de migrations: [docs/migration-plan.md](docs/migration-plan.md). Migração do refresh token para cookie HttpOnly: [docs/refresh-cookie-migration.md](docs/refresh-cookie-migration.md).

## Stack

Node.js (TypeScript strict) · Fastify 5 · Zod 4 · Vitest · ESLint + Prettier · PostgreSQL (via Podman) · GitHub Actions.
Prisma 7.10.1 (`@prisma/adapter-pg`) · Argon2id (`argon2`) · JWT (`jose`). Swagger entra em uma fase futura.

## Pré-requisitos

- Node.js ≥ 24.11 (desenvolvido em 26; veja `.nvmrc`) e npm ≥ 11
- Podman e podman-compose (para o PostgreSQL local)

## Como executar

```bash
npm ci
cp .env.example .env        # ajuste a senha do banco
openssl rand -hex 32        # cole a saída em JWT_SECRET no .env; não versione a chave
npm run db:up               # sobe PostgreSQL dev (5432) e teste (5433)
npm run db:migrate:deploy   # aplica as migrations no banco de DESENVOLVIMENTO
npm run db:migrate:test     # aplica as migrations no banco de TESTES
npm run dev                 # http://127.0.0.1:3000
curl http://127.0.0.1:3000/health
```

## Scripts

| Script                          | O que faz                                      |
| ------------------------------- | ---------------------------------------------- |
| `npm run dev`                   | Servidor com reload (tsx watch)                |
| `npm run build` / `npm start`   | Compila para `dist/` / executa o build         |
| `npm run lint` · `format:check` | ESLint (strict, type-checked) · Prettier       |
| `npm run typecheck`             | `tsc --noEmit`                                 |
| `npm run openapi:generate`      | Regenera `openapi.json` (`scripts/openapi.ts`) |
| `npm test` · `test:coverage`    | Vitest                                         |
| `npm run db:up` · `db:down`     | Sobe/derruba os bancos via podman-compose      |

## Arquitetura inicial

```
src/
  app.ts          buildApp(env): monta o Fastify sem escutar porta (testável via app.inject)
  server.ts       entrypoint: listen + encerramento gracioso (SIGINT/SIGTERM)
  config/env.ts   variáveis de ambiente validadas com Zod (falha rápida no boot)
  plugins/        preocupações transversais (erros, Prisma e autenticação JWT)
  modules/        um diretório por domínio (health e auth: rotas, schema e serviço)
tests/
  unit/ · integration/
```

## Cadastro de usuários

`POST /api/v1/auth/register` recebe JSON com exclusivamente:

- `name`: texto de 2 a 100 caracteres após trim.
- `email`: e-mail válido de até 254 caracteres após trim + lowercase.
- `password`: texto de 8 a 128 caracteres, preservado sem trim.

Sucesso (`201`): `{ "id": "UUID", "name": "Ana Silva", "email": "ana@example.com", "createdAt": "data ISO 8601" }`.
Somente esses quatro campos são consultados e serializados na resposta.

Erros de validação, inclusive campos extras (`400`): `{ "error": "VALIDATION_ERROR", "message": "Dados de cadastro inválidos" }`.
E-mail duplicado (`409`): `{ "error": "EMAIL_ALREADY_EXISTS", "message": "E-mail já cadastrado" }`.
Falhas inesperadas (`500`): `{ "error": "INTERNAL_ERROR", "message": "Erro interno do servidor" }`.
Erros de transporte, como JSON malformado, mantêm o código do Fastify com mensagem genérica.

A constraint UNIQUE do PostgreSQL impede duplicados; o serviço traduz o erro Prisma `P2002`, inclusive em cadastros concorrentes.
A senha usa Argon2id com salt aleatório, memória de 65536 KiB, 3 iterações e paralelismo 4, usando a [API de node-argon2](https://github.com/ranisalt/node-argon2).
Não há registro do corpo da requisição, de senhas ou de erros brutos do Prisma nos logs.

Os testes de cadastro usam o PostgreSQL real de testes, incluindo verificação do hash e concorrência. Antes de `npm test`, execute `npm run db:up` e `npm run db:migrate:test`.

## Login e autenticação JWT

`POST /api/v1/auth/login` recebe somente `email` e `password`, com os mesmos limites do cadastro. O e-mail é normalizado com trim + lowercase; a senha é preservada exatamente. Zod estrito rejeita campos extras.

Sucesso (`200`):

```json
{
  "accessToken": "JWT",
  "refreshToken": "token opaco de 43 caracteres",
  "user": {
    "id": "UUID",
    "name": "Ana Silva",
    "email": "ana@example.com",
    "createdAt": "data ISO 8601"
  }
}
```

Validação (`400`): `{ "error": "LOGIN_VALIDATION_ERROR", "message": "Dados de login inválidos" }`.
Credenciais inválidas (`401`): `{ "error": "INVALID_CREDENTIALS", "message": "E-mail ou senha inválidos" }`.
Usuário inexistente e senha incorreta executam uma verificação Argon2id de mesmo custo e retornam a mesma resposta. O hash de comparação para usuário inexistente é gerado na inicialização, antes de aceitar requisições. Isso reduz diferenças de comportamento; não garante tempo constante para consultas ao banco e processamento completo.

O access token usa HS256 com chave de 256 bits e expira em **15 minutos**. O payload contém exclusivamente `sub` (UUID do usuário), `iat`, `exp`, `iss` e `aud`. A validação usa a [API de verificação do jose](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md), exige essas claims, restringe o algoritmo a HS256 e verifica assinatura, expiração, tipo JWT, issuer, audience e idade máxima de 15 minutos.

Configuração obrigatória: `JWT_SECRET` deve conter exatamente 64 caracteres hexadecimais minúsculos, gerados com `openssl rand -hex 32`. Valores curtos ou com padrões repetidos são rejeitados; a validação de formato não comprova aleatoriedade. Não há segredo padrão. `JWT_ISSUER` e `JWT_AUDIENCE` têm os padrões `devboard-api` e `devboard-client`; configure valores próprios por ambiente. Os testes sempre usam uma chave efêmera independente.

Rotas futuras podem usar o hook compartilhado:

```ts
app.get('/rota-futura', { onRequest: app.authenticate }, (request) => {
  return { userId: request.user?.id };
});
```

O hook aceita somente `Authorization: Bearer <accessToken>` e disponibiliza `request.user = { id }`. Falta de token ou qualquer falha de validação retorna `401` com `{ "error": "UNAUTHORIZED", "message": "Autenticação necessária" }` e `WWW-Authenticate: Bearer`. A rota demonstrativa existe somente nos testes.

Todas as rotas de autenticação respondem com `Cache-Control: no-store`, inclusive nas falhas. Login e refresh definem `refresh_token` HttpOnly; os campos JSON legados continuam temporariamente disponíveis. Logs não incluem corpos, respostas, headers sensíveis ou parâmetros de query; erros inesperados registram somente código genérico.

## Refresh token e logout (Fase 1.4)

Cada login cria uma sessão independente (família UUID). O refresh token é opaco: 32 bytes gerados por `node:crypto.randomBytes`, codificados em base64url canônico sem padding (43 caracteres, 256 bits). Somente seu SHA-256 hexadecimal é persistido em `refresh_tokens`; o token original trafega em cookie HttpOnly e, durante a transição, também na resposta JSON. Não há segredo adicional para refresh tokens. A tabela e os índices existentes da Fase 1.1 já suportam esta implementação; nenhuma migration adicional é necessária.

`POST /api/v1/auth/refresh` usa cookie + corpo `{}` (`credentials: include`). Para compatibilidade temporária também aceita o corpo legado:

```json
{ "refreshToken": "token recebido no login ou no último refresh" }
```

Sucesso (`200`): `{ "accessToken": "JWT", "refreshToken": "novo token opaco" }`.
O novo access token segue as regras anteriores (15 minutos). A sessão expira **sete dias após o login**, sem estender esse prazo ao rotacionar.

A rotação acontece em uma transação PostgreSQL com isolamento `READ COMMITTED`: consulta o hash, obtém um advisory lock transacional por família, relê o token após o lock, verifica revogação/expiração, cria o sucessor e marca o anterior com `revokedAt` e `replacedById`. Refresh e logout usam o mesmo lock, inclusive em processos/instâncias diferentes. O PostgreSQL libera esse [lock ao encerrar a transação](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS). Falhas inesperadas revertem a operação.

Qualquer apresentação de um token revogado no refresh revoga todos os tokens ainda ativos da família, incluindo sucessores. Essa revogação é confirmada no banco **antes** de retornar o erro 401; não é desfeita pelo lançamento do erro. Outras sessões do mesmo usuário permanecem ativas. Os registros anteriores são preservados para detectar reuso.

Em refresh simultâneo com o mesmo token, somente uma requisição pode rotacionar. As demais detectam reuso e revogam a família, inclusive o sucessor emitido pela vencedora. Não há janela de tolerância. O cliente deve coordenar refresh em uma única operação compartilhada entre seus consumidores, evitando retries automáticos do token antigo. Se a resposta de uma rotação se perder na rede, repetir o token antigo exige novo login.

`POST /api/v1/auth/logout` recebe o mesmo JSON e retorna **204 sem corpo** ao revogar toda a sessão correspondente. Aceita também um ancestral conhecido e é idempotente para tokens conhecidos já revogados/expirados. Um token desconhecido ou malformado retorna 401. Logout concorrente com refresh termina com toda a família revogada.

Refresh expirado, desconhecido, revogado ou com formato/corpo inválido retorna a mesma resposta (`401`):

```json
{ "error": "INVALID_REFRESH_TOKEN", "message": "Sessão inválida ou expirada" }
```

JSON malformado mantém o erro genérico de transporte do Fastify (`400`). Tokens em query ou Authorization são rejeitados. O cookie tem precedência sobre o corpo legado e exige Origin da allowlist, JSON e ausência de `Sec-Fetch-Site: cross-site`. Falhas do banco ou da assinatura retornam o erro interno genérico (`500`) sem registrar argumentos sensíveis.

### Contrato de armazenamento no cliente

- Access token somente em memória; refresh token gerenciado pelo navegador em cookie HttpOnly, SameSite=Strict, Path=/api/v1/auth, Secure em produção, sem Domain.
- Login, refresh e logout com `credentials: 'include'`; refresh/logout enviam `{}` e `Origin` permitido em `CORS_ORIGIN`.
- O campo JSON `refreshToken` continua temporariamente disponível, deprecated. O frontend deve descartá-lo. Não usar localStorage/sessionStorage para tokens.
- Uma única operação de refresh em andamento; reuso revoga a família. Logout/401 de refresh limpa a sessão no cliente.
- Frontend e API devem estar no mesmo site para SameSite=Strict. Produção exige HTTPS no proxy e CORS_ORIGIN explícito com origens HTTPS exatas.

JWTs já emitidos seguem válidos até expirar (15 minutos), com checagem de existência da conta a cada requisição autenticada. A limpeza horária remove até 1000 tokens expirados por execução, preservando todos os ancestrais de famílias ainda válidas. Limites por instância: auth 10/min por IP, login também por e-mail; dados 300/min por usuário. Mais detalhes em [contrato](docs/api-contract.md).

Os testes de integração usam PostgreSQL real, incluindo duas instâncias da aplicação para concorrência, revogação de toda a família, isolamento entre sessões, rollback e ausência de segredos nos logs. A suíte anterior de cadastro/login/JWT permanece, com a expectativa da resposta de login atualizada para os dois tokens.

## Perfil do usuário (Fase 1.5)

Ambas as rotas exigem `Authorization: Bearer <accessToken>` e respondem com `Cache-Control: no-store`. Estão em `src/modules/users` e são publicadas diretamente em `/api/v1/me` (fora do prefixo `/auth`).

- `GET /api/v1/me` → `200 { id, name, email, createdAt }`. Token válido de usuário removido → `401 USER_NOT_FOUND`.
- `PATCH /api/v1/me` com `name` e/ou `email` (ao menos um; campos extras ou `id`, `passwordHash` etc. → `400 VALIDATION_ERROR`). E-mail normalizado (trim + minúsculas); e-mail de outro usuário → `409 EMAIL_ALREADY_EXISTS`, inclusive sob concorrência (a constraint UNIQUE decide).

## Decisões técnicas

- **TypeScript 6.0.3 (e não 7.x):** o TS 7 é o `latest` no npm, mas `typescript-eslint@8.72.1` declara `typescript <6.1.0` como peer dependency; usar o 7 quebraria o lint com tipos. Reavaliar quando o typescript-eslint suportar o TS 7.
- **Isolamento do banco de testes:** instância separada (`db_test`, porta 5433, tmpfs). O Vitest força `DATABASE_URL` para ela e `loadEnv()` recusa, em `NODE_ENV=test`, qualquer banco cujo nome não termine em `_test`.
- **Prisma 7 com adapter `pg`:** `prisma.config.ts` define a URL do banco; o client é gerado em `src/generated/prisma` (ignorado pelo Git) e instanciado uma vez em `plugins/prisma.ts` (`app.prisma`), com `$disconnect()` em `app.close()`. Sem camada de repositório separada.
- **Prisma 7.10.1 (série `prev`):** a tag `latest` do npm aponta para 8.0.0-rc; fixamos a última 7.x estável, com `prisma`, `@prisma/client` e `@prisma/adapter-pg` na mesma versão.
- **Migrations seguras por alvo:** `prisma.config.ts` usa `DATABASE_URL` por padrão (recusa banco `*_test`) e `TEST_DATABASE_URL` com `PRISMA_TARGET=test` (exige banco `*_test`). O CI aplica as migrations em um Postgres de serviço.
- **Constraints no SQL da migration:** `users.email` em minúsculas e `refresh_tokens.expires_at > created_at` (CHECKs que o Prisma não expressa); IDs UUID v7 no Postgres (`uuid`), timestamps `timestamptz`.
- **Logs estruturados** com pino (embutido no Fastify), com `authorization`/`cookie`, corpo, campos de senha, tokens e segredos redigidos; parâmetros de query não aparecem no log da requisição. Erros inesperados registram somente um código genérico, sem argumentos de queries ou stack sensível.
- **Variáveis de ambiente** carregadas com `--env-file-if-exists` do Node (sem dotenv).
- **Podman:** `compose.yaml` usa nomes de imagem totalmente qualificados e publica portas só em `127.0.0.1`.

## Backend MVP: execução e imagem

Projetos, membros, tarefas, board, movimentos, comentários e atividades estão disponíveis em `/api/v1` conforme `openapi.json`. O servidor controla ranks e usa advisory locks no PostgreSQL para autorizações e alterações concorrentes. A paginação usa consultas limitadas e cursores assinados vinculados à consulta e ao usuário.

```bash
npm run db:migrate:test   # somente devboard_test
npm run openapi:validate # Redocly CLI 2.78.0 fixado
npm test
podman build --format docker -t devboard-backend:local .
```

A imagem usa usuário `node`, build em estágios e healthcheck em `/ready`. Não executa migrations no boot. `/health` é liveness; `/ready` consulta o PostgreSQL e retorna 503 genérico quando indisponível. Variáveis mínimas: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`; configure HTTPS no proxy reverso. `trustProxy` está desativado: preserve Origin e configure IPs confiáveis antes de usar encaminhamento do IP real. Migrations locais recusam `NODE_ENV=production`; somente bancos de desenvolvimento/teste foram migrados nesta fase.

## Executar o MVP integrado

```bash
npm ci
npm ci --prefix web
npm run db:up
npm run db:migrate         # exclusivamente no banco de desenvolvimento local
npm run dev               # terminal 1: API em localhost:3000
npm --prefix web run dev   # terminal 2: frontend em http://localhost:5173
```

O frontend usa a API real por padrão; não é necessário criar um arquivo de ambiente.
`web/.env.example` documenta as opções. O proxy Vite encaminha `/api`, `/health` e `/ready` à API,
preservando cookies e Origin. Acesse `http://localhost:5173` (allowlist padrão do backend).
Se alterar host/porta, ajuste `CORS_ORIGIN` à origem exata do navegador. Não misture localhost
com 127.0.0.1. Mocks continuam disponíveis apenas explicitamente, por exemplo `VITE_MOCKS=all`.

```bash
npx playwright install chromium   # uma vez; em Linux CI use --with-deps
npm run db:migrate:test
npm run check                    # checks de ambos, testes backend/frontend e E2E reais
```

`npm run test:e2e` inicia seus próprios servidores (API 3101, Vite 5174), força
`VITE_MOCKS=none` e usa somente `TEST_DATABASE_URL` com nome terminado em `_test`.
As portas devem estar livres. Os testes não reutilizam servidores existentes e removem
somente as contas/projetos que eles próprios criaram. O relatório HTML local é gerado
em `playwright-report/` (ignorado pelo Git). O CI executa também frontend e Chromium;
resultados de falhas são preservados como artefatos.
