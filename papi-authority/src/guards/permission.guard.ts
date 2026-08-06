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
 * Authorization for papi-authority's own API, driven entirely by token claims —
 * no database read on the hot path.
 *
 * **DEFAULT-DENY.** An authenticated route with no `@RequirePermissions` and no
 * `@SkipPermissions` is REFUSED. This follows papi-back rather than rmp, whose
 * guard defaults to allow so any authenticated project member passes an
 * undecorated route (dossier F.1) — a whole class of accidental exposure.
 *
 * PHASE 4 SKELETON: the check is real, but the claims it reads are still
 * populated by the Phase 4 stub resolver (role permissions only). Phase 5
 * supplies `(L2 ∩ L3) − L4`, after which this guard becomes fully meaningful
 * without changing.
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
     * PLATFORM scope (dossier 0.43): papi-authority's own administration. No
     * `x-project-id` — these resources belong to no tenant — so the check reads
     * the `platform` claim, which carries role grants alone.
     */
    if (platformRequired && platformRequired.length > 0) {
      const platform = claims['platform'];
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

    const projectId = request.headers['x-project-id'];
    if (typeof projectId !== 'string') {
      throw new ForbiddenException('x-project-id header is required.');
    }

    const projects = claims['projects'];
    const permissions = isProjectMap(projects) ? projects[projectId] : undefined;

    // The token carries every project the user may act on, so an unknown
    // project id here means the caller is reaching outside their grant.
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
