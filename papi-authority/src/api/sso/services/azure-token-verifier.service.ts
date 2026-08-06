import { Injectable } from '@nestjs/common';

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import type { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';

export class AzureVerificationError extends Error {}

export interface AzureIdentity {
  /** Immutable Azure object id — the durable identity, unlike email. */
  oid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tenantId: string;
}

interface AzureClaims {
  oid?: string;
  tid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Verifies Microsoft Entra ID tokens (dossier 0.9 / 0.41).
 *
 * Unlike our own tokens — which we assemble by hand because remote signing
 * forbids a library (0.32) — inbound verification uses `jwks-rsa` +
 * `jsonwebtoken`. JWKS caching and key rotation against an issuer we do not
 * control are precisely what a maintained library should own.
 *
 * The Azure token is ONLY identity proof. It never conveys authorization: what
 * a person may do on the platform comes solely from papi-authority's own model,
 * so a valid Azure token for an unknown or unapproved person grants nothing.
 */
@Injectable()
export class AzureTokenVerifierService {
  /** One JWKS client per tenant; each caches keys and rate-limits fetches. */
  private readonly clients = new Map<string, jwksClient.JwksClient>();

  async verify(token: string, tenantId: string, clientId: string): Promise<AzureIdentity> {
    const claims = await this.verifySignature(token, tenantId, clientId);

    // `tid` must match the tenant we verified against — a token from another
    // tenant signed by another tenant's key must never be accepted.
    if (claims.tid !== tenantId) {
      throw new AzureVerificationError('Token tenant does not match the configured tenant.');
    }

    if (!claims.oid) {
      throw new AzureVerificationError('Token is missing the oid claim.');
    }

    const email = claims.preferred_username ?? claims.email ?? claims.upn;
    if (!email) {
      throw new AzureVerificationError('Token carries no email identifier.');
    }

    return {
      oid: claims.oid,
      email: email.toLowerCase(),
      firstName: claims.given_name ?? null,
      lastName: claims.family_name ?? null,
      tenantId,
    };
  }

  private verifySignature(token: string, tenantId: string, clientId: string): Promise<AzureClaims> {
    const client = this.clientFor(tenantId);

    const getKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
      client.getSigningKey(header.kid, (error, key) => {
        if (error || !key) {
          callback(error ?? new Error('Signing key not found.'));
          return;
        }
        callback(null, key.getPublicKey());
      });
    };

    return new Promise<AzureClaims>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          // The algorithm is OUR policy, never taken from the token header.
          algorithms: ['RS256'],
          audience: clientId,
          issuer: [
            `https://login.microsoftonline.com/${tenantId}/v2.0`,
            `https://sts.windows.net/${tenantId}/`,
          ],
          clockTolerance: 30,
        },
        (error, decoded) => {
          if (error || !decoded || typeof decoded === 'string') {
            reject(new AzureVerificationError('Azure token verification failed.'));
            return;
          }
          resolve(decoded as AzureClaims);
        },
      );
    });
  }

  private clientFor(tenantId: string): jwksClient.JwksClient {
    let client = this.clients.get(tenantId);

    if (!client) {
      client = jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
      this.clients.set(tenantId, client);
    }

    return client;
  }
}
