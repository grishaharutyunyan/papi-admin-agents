import { Module } from '@nestjs/common';

import { JwksVerifierService } from '$/core/jwks/jwks-verifier.service';

@Module({
  providers: [JwksVerifierService],
  exports: [JwksVerifierService],
})
export class JwksModule {}
