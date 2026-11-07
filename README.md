# DevBoard

API REST de gerenciamento de projetos e tarefas (estilo Jira/Trello), construída como projeto de portfólio.

**Status:** Fase 1.4 — cadastro, login, JWT, refresh token com rotação e logout. Perfil, projetos e tarefas ficam para as próximas fases.

Relatório da implementação e das verificações: [Fase 1.4](docs/fase-1.4.md).

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

Todas as rotas de autenticação respondem com `Cache-Control: no-store`, inclusive nas falhas. Não são criados cookies. Logs não incluem corpos, respostas, headers sensíveis ou parâmetros de query; erros inesperados registram somente código genérico.

## Refresh token e logout (Fase 1.4)

Cada login cria uma sessão independente (família UUID). O refresh token é opaco: 32 bytes gerados por `node:crypto.randomBytes`, codificados em base64url canônico sem padding (43 caracteres, 256 bits). Somente seu SHA-256 hexadecimal é persistido em `refresh_tokens`; o token original existe apenas em memória e na resposta JSON. Não há segredo adicional para refresh tokens. A tabela e os índices existentes da Fase 1.1 já suportam esta implementação; nenhuma migration adicional é necessária.

`POST /api/v1/auth/refresh` recebe exclusivamente JSON:

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

JSON malformado mantém o erro genérico de transporte do Fastify (`400`). Tokens em query, cookies ou Authorization não substituem o corpo exigido. Falhas do banco ou da assinatura retornam o erro interno genérico (`500`) sem registrar argumentos sensíveis.

### Contrato de armazenamento no cliente

- Usar HTTPS fora do desenvolvimento local. Login e refresh entregam ambos os tokens no corpo JSON, sem cookies.
- No navegador, manter os tokens **somente em memória**; não gravar em localStorage, sessionStorage, IndexedDB, URLs, analytics ou logs. Recarregar/fechar a página exige novo login. Não há frontend nesta fase; este é o contrato a ser seguido pelo cliente futuro.
- Em cliente nativo, persistência opcional somente no armazenamento seguro do sistema operacional. O servidor armazena exclusivamente o hash.
- Após refresh, substituir ambos os tokens em memória; após logout ou erro 401 de refresh, apagar os tokens e solicitar novo login. Coordenar refresh para impedir chamadas simultâneas.
- Não se usa autenticação ambiente por cookies: o navegador não anexa o refresh token automaticamente, portanto este fluxo não necessita de token anti-CSRF. A API não habilita CORS e nunca aceita cookies como credencial. Mudar esse contrato para cookies exigirá implementar as proteções CSRF correspondentes. Memória não protege contra JavaScript malicioso em execução: o futuro cliente deve mitigar XSS.

**Limitações:** logout/reuso revogam refresh tokens; JWTs já emitidos continuam válidos até expirar (até 15 minutos), pois a proteção de rotas permanece stateless. Não há rate limiting nem limpeza automática de registros expirados nesta fase. Uma futura política de limpeza deve preservar ancestrais enquanto houver sessão válida para não perder detecção de reuso. Perfil, projetos e tarefas não foram implementados ou alterados.

Os testes de integração usam PostgreSQL real, incluindo duas instâncias da aplicação para concorrência, revogação de toda a família, isolamento entre sessões, rollback e ausência de segredos nos logs. A suíte anterior de cadastro/login/JWT permanece, com a expectativa da resposta de login atualizada para os dois tokens.

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
