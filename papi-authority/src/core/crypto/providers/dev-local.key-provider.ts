import { createPrivateKey, createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { NodeEnv } from '$/constants/enums/config.enums';
import { toPublicJwk } from '$/core/crypto/jwk.helpers';
import type { KeyProvider, PublicJsonWebKey } from '$/core/crypto/key-provider.interface';

import type { KeyObject } from 'node:crypto';

/**
 * Non-production key provider. Holds an RSA key in process memory and signs
 * locally, which is exactly what the production provider refuses to do
 * (dossier 0.32) — hence the hard environment assertion below.
 *
 * `CryptoModule` already selects this only when `KEY_SOURCE=dev_local`, and
 * config validation already rejects that value in staging/production (0.12).
 * The assertion here is a third, independent barrier: if either of those is
 * ever loosened, this provider still refuses to start.
 */
@Injectable()
export class DevLocalKeyProvider implements KeyProvider {
  private readonly logger = new Logger(DevLocalKeyProvider.name);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: PublicJsonWebKey;

  constructor(nodeEnv: NodeEnv, keyPath: string | undefined) {
    if (nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging) {
      throw new Error(
        `DevLocalKeyProvider must never be used with NODE_ENV=${nodeEnv}. ` +
          'Set KEY_SOURCE=azure_key_vault (dossier B.4 / 0.32).',
      );
    }

    this.privateKey = keyPath ? this.loadOrCreate(keyPath) : this.generateEphemeral();
    this.publicJwk = toPublicJwk(createPublicKey(this.privateKey));

    // The kid is logged; key material never is.
    this.logger.warn(
      `Using a LOCAL development signing key (kid=${this.publicJwk.kid}). ` +
        'This key exists in process memory and is not suitable for any real environment.',
    );
  }

  sign(signingInput: Buffer): Promise<Buffer> {
    return Promise.resolve(createSign('RSA-SHA256').update(signingInput).sign(this.privateKey));
  }

  getActiveKid(): Promise<string> {
    return Promise.resolve(this.publicJwk.kid);
  }

  getPublicKeys(): Promise<PublicJsonWebKey[]> {
    return Promise.resolve([this.publicJwk]);
  }

  /**
   * Persisting the dev key keeps `kid` stable across restarts, so tokens minted
   * before a reload still verify. Written 0600 — it is still a private key.
   */
  private loadOrCreate(keyPath: string): KeyObject {
    if (existsSync(keyPath)) {
      return createPrivateKey(readFileSync(keyPath, 'utf8'));
    }

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, pem, { mode: 0o600 });
    chmodSync(keyPath, 0o600);

    this.logger.warn(`Generated a new development signing key at ${keyPath}`);
    return privateKey;
  }

  private generateEphemeral(): KeyObject {
    this.logger.warn(
      'DEV_LOCAL_KEY_PATH is unset — generating an EPHEMERAL signing key. ' +
        'Tokens issued before a restart will not verify afterwards.',
    );
    return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  }
}
