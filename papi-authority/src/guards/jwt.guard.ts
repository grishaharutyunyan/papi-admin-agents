import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { authConfig } from '$/configs/index.configs';
import { TokenVerifierService } from '$/core/crypto/token-verifier.service';
import type { VerifiedToken } from '$/core/crypto/token-verifier.service';
import { IS_PUBLIC_KEY } from '$/decorators/public.decorator';

import type { Request } from 'express';

/** The verified caller, attached to the request for downstream guards. */
export interface AuthenticatedRequest extends Request {
  tokenClaims?: VerifiedToken;
}

/**
 * Authenticates papi-authority's OWN API. Registered globally, so authentication
 * is default-ON and a route must opt out with `@Public()`.
 *
 * Note this guard is for requests TO this service. The forks never call here to
 * verify — they check signatures locally against cached JWKS (dossier B.7).
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerifierService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    try {
      request.tokenClaims = await this.tokenVerifier.verify(header.slice('Bearer '.length), {
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      });
    } catch {
      // Uniform 401 — never report WHY a token failed. The distinction between
      // "expired", "bad signature" and "unknown key" is useful only to an
      // attacker probing the verifier.
      throw new UnauthorizedException();
    }

    return true;
  }
}
