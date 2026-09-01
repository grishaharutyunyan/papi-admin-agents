import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AccessTokenClaims } from '$/constants/interfaces/token-claims.interface';
import { JwksVerifierService } from '$/core/jwks/jwks-verifier.service';
import { IS_PUBLIC_KEY } from '$/decorators/public.decorator';

import type { Request } from 'express';

/** The verified caller, attached to the request for downstream guards (Phase 4). */
export interface AuthenticatedRequest extends Request {
  tokenClaims?: AccessTokenClaims;
}

/**
 * Authenticates every request to THIS service against papi-authority's own
 * access tokens, verified locally against its cached JWKS — zero
 * papi-authority calls on the hot path (Part P.4c/d).
 *
 * Registered globally (`APP_GUARD` in `app.module.ts`), so authentication is
 * default-ON and a route must opt out with `@Public()`. This is the same
 * lesson papi-authority's own `JwtGuard` was built under: registering an
 * authenticating guard globally makes every unmarked route — including
 * `/live`, `/ready` and `GET /api/app-init` — unreachable until it carries
 * `@Public()`.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwksVerifier: JwksVerifierService,
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
      request.tokenClaims = await this.jwksVerifier.verifyAccessToken(
        header.slice('Bearer '.length),
      );
    } catch {
      // Uniform 401 — never report WHY a token failed. Bad signature, wrong
      // `alg`, expired `exp`, wrong `iss`/`aud`, unknown `kid`: the
      // distinction is useful only to an attacker probing the verifier.
      throw new UnauthorizedException();
    }

    return true;
  }
}
