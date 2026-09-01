import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import { jwtConfig, papiAuthorityConfig } from '$/configs/index.configs';
import { isAccessTokenClaims } from '$/constants/interfaces/token-claims.interface';
import type { AccessTokenClaims } from '$/constants/interfaces/token-claims.interface';

import type { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';

/**
 * A single uniform failure for every way verification can fail — bad
 * signature, wrong `alg`, expired `exp`, wrong `iss`/`aud`, unknown `kid`, or
 * a payload that does not carry the claims this service depends on. The
 * caller (`JwtGuard`) never inspects `.message`; which check failed is
 * information useful only to an attacker probing the verifier, never to a
 * legitimate caller.
 */
export class TokenVerificationError extends Error {}

/**
 * Verifies papi-authority-issued access tokens locally, against
 * papi-authority's own cached JWKS — the component that turns a bearer token
 * into a trusted, typed request context with zero papi-authority calls on the
 * hot path (Part P.4c/d).
 *
 * Mirrors papi-authority's own `AzureTokenVerifierService`: `jwks-rsa` +
 * `jsonwebtoken` is the platform's proven-safe choice for verifying a token
 * issued by a party whose keys we do not hold ourselves — JWKS caching and key
 * rotation are exactly what a maintained library should own, on both sides of
 * this platform.
 */
@Injectable()
export class JwksVerifierService {
  /** Lazily built — `jwks-rsa` owns its own cache and rate limiting from here. */
  private client: jwksClient.JwksClient | undefined;

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly papiAuthority: ConfigType<typeof papiAuthorityConfig>,
    @Inject(jwtConfig.KEY) private readonly jwt: ConfigType<typeof jwtConfig>,
  ) {}

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const decoded = await this.verifySignature(token);

    if (!isAccessTokenClaims(decoded)) {
      throw new TokenVerificationError('Access token has an unexpected claim shape.');
    }

    return decoded;
  }

  private verifySignature(token: string): Promise<unknown> {
    const client = this.clientFor();

    const getKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
      if (typeof header.kid !== 'string') {
        callback(new TokenVerificationError('Missing key id.'));
        return;
      }

      client.getSigningKey(header.kid, (error, key) => {
        if (error || !key) {
          callback(error ?? new TokenVerificationError('Unknown key id.'));
          return;
        }
        callback(null, key.getPublicKey());
      });
    };

    return new Promise<unknown>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          // The algorithm is OUR policy, never taken from the token header —
          // this is what makes an `alg: none` / RS256->HS256 confusion attack
          // structurally impossible, not merely unlikely.
          algorithms: ['RS256'],
          issuer: this.jwt.issuer,
          audience: this.jwt.audience,
        },
        (error, decoded) => {
          if (error || decoded === undefined) {
            reject(new TokenVerificationError('Access token verification failed.'));
            return;
          }
          resolve(decoded);
        },
      );
    });
  }

  private clientFor(): jwksClient.JwksClient {
    this.client ??= jwksClient({
      jwksUri: new URL('/.well-known/jwks.json', this.papiAuthority.baseUrl).toString(),
      cache: true,
      // Matches papi-authority's own JWKS `Cache-Control: max-age=300` — long
      // enough that we are not re-fetching constantly, short enough that a
      // rotated key propagates quickly.
      cacheMaxAge: 5 * 60 * 1000,
      cacheMaxEntries: 5,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });

    return this.client;
  }
}
