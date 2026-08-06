import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { coreConfig, cryptoConfig } from '$/configs/index.configs';
import { KeySource } from '$/constants/enums/config.enums';
import { JwksController } from '$/core/crypto/jwks.controller';
import { KEY_PROVIDER } from '$/core/crypto/key-provider.interface';
import type { KeyProvider } from '$/core/crypto/key-provider.interface';
import { PasswordHasherService } from '$/core/crypto/password-hasher.service';
import { AzureKeyVaultKeyProvider } from '$/core/crypto/providers/azure-key-vault.key-provider';
import { DevLocalKeyProvider } from '$/core/crypto/providers/dev-local.key-provider';
import { TokenSignerService } from '$/core/crypto/token-signer.service';
import { TokenVerifierService } from '$/core/crypto/token-verifier.service';

/**
 * Everything that can touch the signing key lives in this module.
 *
 * NOTE WHAT IS *NOT* IN `exports`: `KEY_PROVIDER`. Only `TokenSignerService`
 * crosses the boundary, so no other module in the service is able to inject the
 * key provider even if it tries — the rule is enforced by the DI container
 * rather than by convention (dossier 0.33).
 */
@Module({
  controllers: [JwksController],
  providers: [
    {
      provide: KEY_PROVIDER,
      inject: [cryptoConfig.KEY, coreConfig.KEY],
      useFactory: (
        crypto: ConfigType<typeof cryptoConfig>,
        core: ConfigType<typeof coreConfig>,
      ): KeyProvider => {
        if (crypto.keySource === KeySource.AzureKeyVault) {
          // Config validation guarantees both are present when this branch is
          // taken (0.12); assert anyway rather than construct a client with
          // an empty URI.
          if (!crypto.azureKeyVaultUri || !crypto.azureKeyVaultKeyName) {
            throw new Error(
              'AZURE_KEYVAULT_URI and AZURE_KEYVAULT_KEY_NAME are required when KEY_SOURCE=azure_key_vault.',
            );
          }
          return new AzureKeyVaultKeyProvider(crypto.azureKeyVaultUri, crypto.azureKeyVaultKeyName);
        }

        // Refuses to construct in a prod-like environment (B.4).
        return new DevLocalKeyProvider(core.nodeEnv, crypto.devLocalKeyPath);
      },
    },
    TokenSignerService,
    PasswordHasherService,
    TokenVerifierService,
  ],
  // PasswordHasherService holds no key material (the salt lives in each hash),
  // so unlike KEY_PROVIDER it is safe to export.
  exports: [TokenSignerService, TokenVerifierService, PasswordHasherService],
})
export class CryptoModule {}
