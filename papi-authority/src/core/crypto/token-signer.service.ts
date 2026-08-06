import { Inject, Injectable } from '@nestjs/common';

import { base64UrlJson } from '$/core/crypto/jwk.helpers';
import { KEY_PROVIDER } from '$/core/crypto/key-provider.interface';
import type { KeyProvider } from '$/core/crypto/key-provider.interface';

/** Registered JWT claims this service manages; callers supply the rest. */
export interface TokenClaims extends Record<string, unknown> {
  sub: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

/**
 * The only component that can produce a signature — and the only thing
 * `CryptoModule` exports (dossier 0.33).
 *
 * The JWS compact serialization is assembled here rather than by a JWT library,
 * because remote signing cannot go through `jsonwebtoken.sign()`: that API
 * wants a local private key, which by design does not exist in this process
 * (0.32). The format is RFC 7515 §3.1 —
 *
 *     BASE64URL(header) '.' BASE64URL(payload) '.' BASE64URL(signature)
 *
 * — and every token this method emits is cross-checked against
 * `jsonwebtoken.verify()` in the test suite, so an independent implementation
 * confirms the output rather than our own code marking its own homework.
 */
@Injectable()
export class TokenSignerService {
  constructor(@Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider) {}

  async sign(claims: TokenClaims): Promise<string> {
    const kid = await this.keyProvider.getActiveKid();

    const header = { alg: 'RS256', typ: 'JWT', kid };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;

    const signature = await this.keyProvider.sign(Buffer.from(signingInput, 'ascii'));

    return `${signingInput}.${signature.toString('base64url')}`;
  }

  /** `kid` currently being signed with. Exposed for diagnostics, never the key. */
  getActiveKid(): Promise<string> {
    return this.keyProvider.getActiveKid();
  }
}
