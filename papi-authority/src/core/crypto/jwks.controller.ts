import { Controller, Get, Header, Inject } from '@nestjs/common';

import { KEY_PROVIDER } from '$/core/crypto/key-provider.interface';
import type { KeyProvider, PublicJsonWebKey } from '$/core/crypto/key-provider.interface';
import { Public } from '$/decorators/public.decorator';

/**
 * `GET /.well-known/jwks.json` — how every consumer verifies our tokens
 * without ever calling us on the hot path (dossier B.7).
 *
 * Served from the domain root, not under `/api`: `.well-known` is a reserved
 * URI prefix (RFC 8615) and tooling expects it there. `main.ts` excludes it
 * from the global prefix.
 *
 * Only public key material is exposed — modulus and exponent. There is no path
 * from here to a private key: this controller lives inside `CryptoModule`,
 * whose `KeyProvider` is never exported, and the provider interface has no
 * method that returns key material (0.33).
 */
@Public()
@Controller('.well-known')
export class JwksController {
  constructor(@Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider) {}

  /**
   * Cached for 5 minutes. Long enough that consumers are not re-fetching
   * constantly, short enough that a rotated key propagates quickly — rotation
   * works by publishing the new key here first, waiting out this window, and
   * only then signing with it.
   */
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300, must-revalidate')
  async getJwks(): Promise<{ keys: PublicJsonWebKey[] }> {
    return { keys: await this.keyProvider.getPublicKeys() };
  }
}
