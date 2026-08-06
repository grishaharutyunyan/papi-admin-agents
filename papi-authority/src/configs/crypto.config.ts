import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';
import { KeySource } from '$/constants/enums/config.enums';

/**
 * Key-provider selection only. The private key itself is NEVER exposed through
 * ConfigService — Phase 3 introduces a dedicated key provider whose boundary no
 * other module can inject across (dossier Part H.2).
 */
export const cryptoConfig = registerAs('crypto', () => {
  const e = env();

  return {
    keySource: e.KEY_SOURCE,
    usesKeyVault: e.KEY_SOURCE === KeySource.AzureKeyVault,
    azureKeyVaultUri: e.AZURE_KEYVAULT_URI,
    azureKeyVaultKeyName: e.AZURE_KEYVAULT_KEY_NAME,
    devLocalKeyPath: e.DEV_LOCAL_KEY_PATH,
  };
});
