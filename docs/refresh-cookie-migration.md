# Migração do refresh token para cookie HttpOnly

**Status:** desenho aprovado para implementação (não implementado). Hoje o refresh token trafega no corpo JSON e o cliente o guarda em memória, o que desloga o usuário a cada recarga. Objetivo: o JavaScript nunca vê o refresh token, e a sessão sobrevive ao reload.

## Garantias preservadas

Nada muda em: hash SHA-256 no banco, famílias, rotação com advisory lock, detecção de reuso, validade absoluta de 7 dias, JWT de 15 minutos em memória, `Cache-Control: no-store`, ausência de tokens em logs.

## Contrato final

| Item           | Valor                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie         | `refresh_token=<43 chars base64url>`                                                                                                  |
| Atributos      | `HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=<segundos até expiresAt>`; `Secure` quando `NODE_ENV=production` (obrigatório) |
| Sem `Domain`   | cookie _host-only_ (não vaza para subdomínios)                                                                                        |
| Emitido por    | `POST /auth/login` e `POST /auth/refresh` (`Set-Cookie`)                                                                              |
| Lido por       | `POST /auth/refresh` e `POST /auth/logout` (somente cookie; corpo ignorado)                                                           |
| Removido por   | `POST /auth/logout`, e em `INVALID_REFRESH_TOKEN` (`Set-Cookie` com `Max-Age=0`)                                                      |
| Corpo          | `{ accessToken, user }` e `{ accessToken }`; `refreshToken` removido                                                                  |
| `Path` estrito | o navegador só envia o cookie a `/api/v1/auth/*`, nunca às rotas de dados                                                             |

Por que sem prefixo `__Host-`: ele exige `Path=/`, o que enviaria o cookie a toda a API. Em produção, o `Secure` + `Path` restrito + host-only dá isolamento equivalente para este caso.

## CSRF e Origin

Camadas combinadas (nenhuma depende só de uma):

1. **`SameSite=Strict`**: o navegador não envia o cookie em requisições originadas de outro _site_.
2. **Verificação de `Origin`** em `refresh` e `logout`: o header `Origin` é **obrigatório** e deve estar na allowlist `CORS_ORIGIN` (lista separada por vírgulas, comparação exata de esquema+host+porta). Ausente ou diferente → `403 CSRF_ORIGIN_REJECTED`, **sem** consumir ou revogar o token. (`Sec-Fetch-Site: cross-site` também é rejeitado quando presente.)
3. **`Content-Type: application/json` obrigatório** (Fastify já rejeita outros tipos): formulários HTML não conseguem enviá-lo sem preflight.
4. **CORS restrito**: `Access-Control-Allow-Origin` = origem exata da allowlist (nunca `*`), `Allow-Credentials: true`, métodos e headers mínimos, `Vary: Origin`. Sem CORS para origens fora da lista.
5. Rotas de dados continuam exigindo `Authorization: Bearer`, que nenhum navegador anexa sozinho — logo não são alvo de CSRF.

**Restrição de implantação:** `SameSite=Strict` exige que frontend e API estejam no mesmo _site_ (mesmo domínio registrável; ex.: `app.exemplo.com` + `api.exemplo.com`, ou o frontend servindo `/api` por proxy). Em desenvolvimento, `localhost:5173` e `localhost:3000` são o mesmo site. Domínios distintos exigiriam `SameSite=None; Secure` + token CSRF dedicado — **não** suportado neste desenho.

## Variáveis de ambiente novas

- `CORS_ORIGIN` — obrigatória em produção; em dev padrão `http://localhost:5173`.
- `COOKIE_SECURE` — derivada de `NODE_ENV=production`; em prod recusar subir sem HTTPS à frente (documentar `trustProxy`).

## Transição em 4 passos (sem quebrar o frontend)

1. **Backend A (compatível):** login/refresh passam a emitir o cookie **e** continuam devolvendo `refreshToken` no corpo (`deprecated` no OpenAPI). Refresh/logout aceitam cookie **ou** corpo; a checagem de `Origin` vale **apenas quando o token vem do cookie**. Testes cobrem os dois caminhos.
2. **Frontend:** passa a usar `credentials: 'include'`, descarta `refreshToken` do corpo, restaura a sessão com `POST /auth/refresh` ao iniciar.
3. **Backend B (remoção):** só após o frontend confirmar o passo 2 e a verificação em ambiente de testes, remover `refreshToken` do corpo das respostas e a aceitação do corpo em refresh/logout (mudança incompatível, versão do contrato muda para `1.0.0`).
4. **Documentação:** atualizar README e `docs/fase-1.4.md` ("contrato de armazenamento no cliente").

## Testes exigidos (backend)

Atributos do cookie (`HttpOnly`, `SameSite=Strict`, `Path`, `Secure` em produção, `Max-Age`); ausência do token em corpo/logs no passo B; `Origin` ausente/estranho → 403 sem efeito colateral; preflight CORS; refresh concorrente e reuso preservados (suíte de sessão existente reaproveitada); logout limpa o cookie; token inválido limpa o cookie; cookie de outro `Path` ignorado.

## Riscos

- XSS ainda permite usar a sessão via requisições do navegador, embora não exfiltre o refresh token; mitigar com CSP no frontend.
- Proxy mal configurado pode descartar `Secure`/`Origin`; cobrir com `trustProxy` e teste de produção simulada.
