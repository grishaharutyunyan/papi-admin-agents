/**
 * A public key in JWK form, exactly as it appears in `/.well-known/jwks.json`.
 * Contains no private material — `n` and `e` are the public modulus and
 * exponent.
 */
export interface PublicJsonWebKey {
  kty: 'RSA';
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

/**
 * The boundary around the signing key.
 *
 * The interface is deliberately SIGN-oriented, not key-oriented: there is no
 * `getPrivateKey()` and no way to obtain key material through it. With Azure
 * Key Vault (the production provider) the private key is never present in this
 * process at all — signing happens inside the vault (dossier 0.32).
 *
 * This symbol is provided inside `CryptoModule` and never exported, so no other
 * module can inject it (0.33).
 */
export interface KeyProvider {
  /**
   * Sign the JWS signing input (`base64url(header).base64url(payload)`) with
   * RS256 and return the raw signature bytes.
   *
   * Implementations own the digest step: Key Vault is handed a SHA-256 digest,
   * while a local key is signed with `RSA-SHA256` in one call.
   */
  sign(signingInput: Buffer): Promise<Buffer>;

  /** `kid` of the key currently used for signing; goes in the JWS header. */
  getActiveKid(): Promise<string>;

  /**
   * Every public key consumers should trust, active key first. Returning more
   * than one is what makes rotation possible: publish the new key, wait for
   * caches to pick it up, then start signing with it.
   */
  getPublicKeys(): Promise<PublicJsonWebKey[]>;
}

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');
