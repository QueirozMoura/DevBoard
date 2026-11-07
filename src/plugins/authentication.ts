import type { FastifyInstance, FastifyRequest } from 'fastify';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { AppError } from './errors.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

interface AuthenticatedUser {
  id: string;
}

interface AccessTokens {
  sign(userId: string): Promise<string>;
  verify(token: string): Promise<AuthenticatedUser>;
}

declare module 'fastify' {
  interface FastifyInstance {
    accessTokens: AccessTokens;
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

const identitySchema = z.object({
  sub: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

/** Infraestrutura compartilhada; nenhuma rota protegida é publicada nesta fase. */
export function registerAuthentication(app: FastifyInstance, env: Env): void {
  const key = Buffer.from(env.JWT_SECRET, 'hex');

  const accessTokens: AccessTokens = {
    async sign(userId) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          typ: 'JWT',
          requiredClaims: ['sub', 'iat', 'exp', 'iss', 'aud'],
          maxTokenAge: ACCESS_TOKEN_TTL_SECONDS,
        });
        const identity = identitySchema.safeParse(payload);
        if (
          !identity.success ||
          identity.data.exp <= identity.data.iat ||
          identity.data.exp - identity.data.iat > ACCESS_TOKEN_TTL_SECONDS
        ) {
          throw new AppError('UNAUTHORIZED');
        }
        return { id: identity.data.sub };
      } catch (error) {
        if (error instanceof errors.JOSEError) throw new AppError('UNAUTHORIZED');
        throw error;
      }
    },
  };

  app.decorate('accessTokens', accessTokens);
  app.decorateRequest('user', null);
  app.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
    // Somente Authorization: Bearer; tokens em query/cookie não são aceitos.
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer (\S+)$/i);
    const token = match?.[1];
    if (!token || token.length > 8192) throw new AppError('UNAUTHORIZED');
    request.user = await accessTokens.verify(token);
  });
}
