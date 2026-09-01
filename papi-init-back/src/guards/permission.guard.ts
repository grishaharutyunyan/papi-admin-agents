import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { ProjectPermissionSet } from '$/constants/interfaces/token-claims.interface';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  PLATFORM_PERMISSIONS_KEY,
  SKIP_PERMISSIONS_KEY,
} from '$/decorators/public.decorator';
import type { PermissionTuple } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * Authorization for every route in this service (and, once a panel forks
 * this skeleton, that panel's own routes) — driven entirely by
 * `request.tokenClaims`, already verified and attached by `JwtGuard`
 * (Phase 2). This guard NEVER re-verifies the token and NEVER calls
 * papi-authority: every permission set it reads was resolved once, at
 * token-issuance time, inside papi-authority's own `auth.service.ts` (the
 * 4-layer model, dossier Part F.5) and baked straight into the token's
 * `projects`/`platform` claims.
 *
 * **DEFAULT-DENY.** An authenticated route with no `@RequirePermissions`, no
 * `@PlatformPermissions`, and no `@SkipPermissions` is refused — the same
 * posture as papi-authority's own `PermissionGuard`, and deliberately not
 * rmp's allow-by-default (dossier F.1), where any authenticated project
 * member passes an undecorated route.
 *
 * Checks are against `.apis` (the backend-enforcement array) only. `.pages`
 * is frontend menu/route visibility — surfaced later via
 * `GET /api/auth/session` (Phase 5) — never something a backend guard
 * evaluates.
 *
 * Re-implemented fresh from papi-authority's `PermissionGuard` shape (same
 * algorithm, own code — dossier 0.3), adapted to this service's token
 * consumer role: papi-authority resolves the four permission layers once at
 * login; this guard only reads the resolved sets off the token.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_PERMISSIONS_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<PermissionTuple[]>(PERMISSIONS_KEY, targets);
    const platformRequired = this.reflector.getAllAndOverride<PermissionTuple[]>(
      PLATFORM_PERMISSIONS_KEY,
      targets,
    );

    // Default-deny: undeclared means forbidden, not allowed.
    if (
      (!required || required.length === 0) &&
      (!platformRequired || platformRequired.length === 0)
    ) {
      throw new ForbiddenException('This route declares no permission requirement.');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = request.tokenClaims;
    if (!claims) throw new ForbiddenException();

    /**
     * PLATFORM scope: no `x-project-id` — these resources belong to no
     * tenant — so the check reads the `platform` claim directly.
     */
    if (platformRequired && platformRequired.length > 0) {
      const platform = claims.platform;
      const grantedPlatform = new Set(isPermissionSet(platform) ? platform.apis : []);
      const missingPlatform = platformRequired.filter(
        ([section, key]) => !grantedPlatform.has(`${section}.${key}`),
      );

      if (missingPlatform.length > 0) {
        throw new ForbiddenException('Insufficient platform permissions.');
      }

      // A route may declare only platform requirements; if so we are done.
      if (!required || required.length === 0) return true;
    }

    // PROJECT scope: requires x-project-id, checked against
    // claims.projects[x-project-id].apis.
    const projectId = request.headers['x-project-id'];
    if (typeof projectId !== 'string') {
      throw new ForbiddenException('x-project-id header is required.');
    }

    const projects = claims.projects;
    const permissions = isProjectMap(projects) ? projects[projectId] : undefined;

    // The token carries every project the caller may act on, so an unknown
    // project id here means the caller is reaching outside their own grant.
    if (!permissions) throw new ForbiddenException('No access to this project.');

    const granted = new Set(permissions.apis);
    const missing = required.filter(([section, key]) => !granted.has(`${section}.${key}`));

    if (missing.length > 0) throw new ForbiddenException('Insufficient permissions.');

    return true;
  }
}

function isProjectMap(value: unknown): value is Record<string, ProjectPermissionSet> {
  return typeof value === 'object' && value !== null;
}

function isPermissionSet(value: unknown): value is ProjectPermissionSet {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as ProjectPermissionSet).apis)
  );
}
