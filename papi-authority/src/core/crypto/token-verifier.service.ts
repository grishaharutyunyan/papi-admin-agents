import { createPublicKey, createVerify } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { KEY_PROVIDER } from '$/core/crypto/key-provider.interface';
import type { KeyProvider } from '$/core/crypto/key-provider.interface';

import type { JsonWebKey as NodeJsonWebKey } from 'node:crypto';

export interface VerifiedToken extends Record<string, unknown> {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
}

export class TokenVerificationError extends Error {}

/**
 * Verifies tokens this service itself issued (papi-authority's own API is a
 * consumer of its own tokens). The forks verify independently against JWKS —
 * they never call us on the hot path (dossier B.7).
 *
 * Written defensively against the classic JWT attacks:
 *
 *  - the algorithm is taken from OUR policy, never from the token header, so
 *    `alg: none` and RS256->HS256 confusion are structurally impossible;
 *  - `kid` must match a published key — an unknown `kid` is rejected outright
 *    rather than falling back to "try every key";
 *  - the signature is verified BEFORE any claim is read or trusted.
 */
@Injectable()
export class TokenVerifierService {
  constructor(@Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider) {}

  async verify(
    token: string,
    expected: { issuer: string; audience: string },
  ): Promise<VerifiedToken> {
    const segments = token.split('.');
    if (segments.length !== 3) throw new TokenVerificationError('Malformed token.');

    const [encodedHeader, encodedPayload, encodedSignature] = segments as [string, string, string];

    const header = decodeJson(encodedHeader);
    if (!header || header['typ'] !== 'JWT') throw new TokenVerificationError('Bad token header.');

    // Never read `alg` from the token to decide how to verify it.
    if (header['alg'] !== 'RS256') throw new TokenVerificationError('Unsupported algorithm.');

    const kid = header['kid'];
    if (typeof kid !== 'string') throw new TokenVerificationError('Missing key id.');

    const keys = await this.keyProvider.getPublicKeys();
    const jwk = keys.find((candidate) => candidate.kid === kid);
    if (!jwk) throw new TokenVerificationError('Unknown key id.');

    const publicKey = createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: 'jwk' });
    const signatureValid = createVerify('RSA-SHA256')
      .update(`${encodedHeader}.${encodedPayload}`, 'ascii')
      .verify(publicKey, Buffer.from(encodedSignature, 'base64url'));

    if (!signatureValid) throw new TokenVerificationError('Invalid signature.');

    // Only now is the payload trustworthy.
    const payload = decodeJson(encodedPayload);
    if (!payload) throw new TokenVerificationError('Malformed payload.');

    if (payload['iss'] !== expected.issuer) throw new TokenVerificationError('Unexpected issuer.');
    if (payload['aud'] !== expected.audience)
      throw new TokenVerificationError('Unexpected audience.');

    const exp = payload['exp'];
    if (typeof exp !== 'number' || exp * 1000 <= Date.now()) {
      throw new TokenVerificationError('Token expired.');
    }

    if (typeof payload['sub'] !== 'string' || typeof payload['jti'] !== 'string') {
      throw new TokenVerificationError('Missing required claims.');
    }

    return payload as unknown as VerifiedToken;
  }
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
