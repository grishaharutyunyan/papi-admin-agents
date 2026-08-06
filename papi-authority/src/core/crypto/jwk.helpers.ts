import { createHash, createPublicKey } from 'node:crypto';

import type { PublicJsonWebKey } from '$/core/crypto/key-provider.interface';

import type { KeyObject } from 'node:crypto';

/**
 * RFC 7638 JWK thumbprint, used as the `kid`.
 *
 * A thumbprint is deterministic — the same key always yields the same `kid` —
 * so a restart cannot silently orphan tokens that are still in flight, and two
 * providers holding the same key agree on its identifier. The member ordering
 * below is fixed by the RFC (`e`, `kty`, `n`, lexicographic) and must not be
 * "tidied".
 */
export function jwkThumbprint(n: string, e: string): string {
  const canonical = JSON.stringify({ e, kty: 'RSA', n });
  return createHash('sha256').update(canonical).digest('base64url');
}

/** Builds the public JWK for an RSA public key, with its thumbprint as `kid`. */
export function toPublicJwk(publicKey: KeyObject): PublicJsonWebKey {
  const jwk = publicKey.export({ format: 'jwk' });

  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
    throw new Error('Signing key must be an RSA key.');
  }

  return {
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    kid: jwkThumbprint(jwk.n, jwk.e),
    n: jwk.n,
    e: jwk.e,
  };
}

/**
 * Builds a public JWK from raw modulus/exponent bytes, which is how Azure Key
 * Vault returns a key. Round-tripping through `createPublicKey` validates the
 * material rather than trusting it.
 */
export function toPublicJwkFromComponents(
  modulus: Uint8Array,
  exponent: Uint8Array,
): PublicJsonWebKey {
  const n = Buffer.from(modulus).toString('base64url');
  const e = Buffer.from(exponent).toString('base64url');

  const publicKey = createPublicKey({
    key: { kty: 'RSA', n, e },
    format: 'jwk',
  });

  return toPublicJwk(publicKey);
}

export function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
