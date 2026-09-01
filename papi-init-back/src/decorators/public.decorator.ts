import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'papi:isPublic';

/**
 * Marks a route as reachable without an access token.
 *
 * Authentication is default-ON from Phase 2 onward: `JwtGuard` will run
 * globally and reject anything not explicitly marked. The decorator ships in
 * Phase 1 because `/live`, `/ready` and `/api/app-init` already need it, even
 * though no guard reads it yet — forgetting it later makes a route
 * inaccessible (a loud failure) rather than silently public.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const AUTH_THROTTLE_KEY = 'papi:authThrottle';

/**
 * Applies the tight `auth` rate-limit bucket to a route (Phase 3's
 * login/refresh/SSO proxy). The bucket is registered globally, so it carries
 * a `skipIf` that exempts any handler without this marker — otherwise a
 * 10/min credential limit would throttle the entire API.
 */
export const AuthThrottle = (): MethodDecorator => SetMetadata(AUTH_THROTTLE_KEY, true);

export const PERMISSIONS_KEY = 'papi:permissions';

/**
 * A required permission, as `[section, key]` — checked against the resolved
 * project's `.apis` array (never `.pages`, which is frontend menu/route
 * visibility, not something a backend guard enforces).
 */
export type PermissionTuple = [section: string, key: string];

/**
 * Declares what a route requires, scoped to the project named by the
 * `x-project-id` header. Authorization is DEFAULT-DENY: a non-public route
 * with no `@RequirePermissions`, no `@PlatformPermissions`, and no
 * `@SkipPermissions` is refused by `PermissionGuard` (Phase 4) — mirrors
 * papi-authority's own `PermissionGuard`/`public.decorator.ts` convention
 * (same metadata key string, `papi:permissions`) so the two services read
 * identically to anyone working across both.
 */
export const RequirePermissions = (...permissions: PermissionTuple[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PLATFORM_PERMISSIONS_KEY = 'papi:platformPermissions';

/**
 * Declares a PLATFORM-scoped requirement, checked against the token's
 * `platform` claim and needing no `x-project-id` — for any panel-scoped-but-
 * not-project route a fork adds later (mirrors papi-authority's own
 * dossier-0.43 pattern). Use `@RequirePermissions` for anything scoped to a
 * tenant project instead.
 */
export const PlatformPermissions = (...permissions: PermissionTuple[]): MethodDecorator =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);

export const SKIP_PERMISSIONS_KEY = 'papi:skipPermissions';

/**
 * Exempts an authenticated route from the permission check — for a
 * self-resource route where being signed in is the only thing to authorize
 * (e.g. Phase 5's `/api/users/me` proxy). Deliberately explicit and
 * greppable: every use is a decision to audit, not an accidental gap.
 */
export const SkipPermissions = (): MethodDecorator => SetMetadata(SKIP_PERMISSIONS_KEY, true);
