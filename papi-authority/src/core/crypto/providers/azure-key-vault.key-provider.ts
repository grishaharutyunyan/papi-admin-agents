import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { DefaultAzureCredential } from '@azure/identity';
import { CryptographyClient, KeyClient } from '@azure/keyvault-keys';

import { toPublicJwkFromComponents } from '$/core/crypto/jwk.helpers';
import type { KeyProvider, PublicJsonWebKey } from '$/core/crypto/key-provider.interface';

import type { KeyVaultKey } from '@azure/keyvault-keys';

/**
 * Production key provider (dossier 0.32).
 *
 * The private key NEVER enters this process. We compute the SHA-256 digest of
 * the JWS signing input locally and Key Vault performs the RSA operation
 * internally, returning only the signature. Consequently:
 *
 *   - Compromising this service does not yield the key. An attacker can request
 *     signatures only while they hold the process, and revoking the app's Key
 *     Vault access ends that immediately.
 *   - Key Vault is a hard dependency for issuing tokens. A vault outage blocks
 *     new logins and refreshes; it does NOT break the platform, because the
 *     forks verify locally against cached JWKS (B.7) and existing access tokens
 *     stay valid to their TTL.
 *
 * Authentication is `DefaultAzureCredential` — managed identity in Azure, no
 * client secret in configuration.
 */
@Injectable()
export class AzureKeyVaultKeyProvider implements KeyProvider {
  private readonly logger = new Logger(AzureKeyVaultKeyProvider.name);
  private readonly keyClient: KeyClient;
  private readonly keyName: string;

  private cryptographyClient?: CryptographyClient;
  private publicJwk?: PublicJsonWebKey;

  constructor(vaultUri: string, keyName: string) {
    this.keyName = keyName;
    this.keyClient = new KeyClient(vaultUri, new DefaultAzureCredential());
  }

  async sign(signingInput: Buffer): Promise<Buffer> {
    const client = await this.getCryptographyClient();

    // Key Vault signs a PRE-COMPUTED digest for RS256 — it does not hash for
    // us. Passing the raw input here would produce signatures that verify
    // nowhere.
    const digest = createHash('sha256').update(signingInput).digest();
    const { result } = await client.sign('RS256', digest);

    return Buffer.from(result);
  }

  async getActiveKid(): Promise<string> {
    return (await this.loadPublicJwk()).kid;
  }

  async getPublicKeys(): Promise<PublicJsonWebKey[]> {
    return [await this.loadPublicJwk()];
  }

  private async getCryptographyClient(): Promise<CryptographyClient> {
    if (!this.cryptographyClient) {
      const key = await this.fetchKey();
      this.cryptographyClient = new CryptographyClient(key.id ?? '', new DefaultAzureCredential());
    }
    return this.cryptographyClient;
  }

  /**
   * Cached: the public half does not change between rotations of the same key
   * version, and JWKS is served on every consumer's cache miss.
   */
  private async loadPublicJwk(): Promise<PublicJsonWebKey> {
    if (!this.publicJwk) {
      const key = await this.fetchKey();

      if (!key.key?.n || !key.key.e) {
        throw new Error(`Key Vault key "${this.keyName}" did not return RSA public components.`);
      }

      this.publicJwk = toPublicJwkFromComponents(key.key.n, key.key.e);
      this.logger.log(`Signing key loaded from Key Vault (kid=${this.publicJwk.kid})`);
    }

    return this.publicJwk;
  }

  private async fetchKey(): Promise<KeyVaultKey> {
    const key = await this.keyClient.getKey(this.keyName);

    if (key.keyType !== 'RSA' && key.keyType !== 'RSA-HSM') {
      throw new Error(`Key Vault key "${this.keyName}" must be RSA, got ${String(key.keyType)}.`);
    }

    return key;
  }
}
