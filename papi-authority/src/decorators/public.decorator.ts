import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'papi:isPublic';

/**
 * Marks a route as reachable without an access token.
 *
 * Authentication is default-ON: `JwtGuard` runs globally and rejects anything
 * not explicitly marked. Forgetting this decorator makes a route inaccessible —
 * a loud failure — rather than silently public.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'papi:permissions';

/** A required permission, as `[section, key]`. */
export type PermissionTuple = [section: string, key: string];

/**
 * Declares what a route requires. Authorization is DEFAULT-DENY: a non-public
 * route with no `@RequirePermissions` is refused by `PermissionGuard`.
 *
 * This is papi-back's behaviour, not rmp's — rmp defaults to ALLOW, so any
 * authenticated project member passes an undecorated route (dossier F.1).
 */
export const RequirePermissions = (...permissions: PermissionTuple[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PLATFORM_PERMISSIONS_KEY = 'papi:platformPermissions';

/**
 * Declares a PLATFORM-scoped requirement, checked against the token's
 * `platform` claim and needing no `x-project-id` (dossier 0.43).
 *
 * Use this for papi-authority's own administration — invitations, users, roles,
 * admin panels, platform settings. Use `@RequirePermissions` for anything
 * scoped to a tenant project. The two are deliberately distinct at the call
 * site so a reader can tell which model applies without tracing the guard.
 */
export const PlatformPermissions = (...permissions: PermissionTuple[]): MethodDecorator =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, permissions);

export const SKIP_PERMISSIONS_KEY = 'papi:skipPermissions';

/**
 * Exempts an authenticated route from the permission check. Deliberately
 * explicit and greppable — every use is a decision to audit.
 */
export const SkipPermissions = (): MethodDecorator => SetMetadata(SKIP_PERMISSIONS_KEY, true);

export const AUTH_THROTTLE_KEY = 'papi:authThrottle';

/**
 * Applies the tight `auth` rate-limit bucket to a route.
 *
 * The bucket is registered globally (every named throttler in the array is),
 * so it carries a `skipIf` that exempts any handler without this marker —
 * otherwise a 10/min credential limit would throttle the entire API.
 */
export const AuthThrottle = (): MethodDecorator => SetMetadata(AUTH_THROTTLE_KEY, true);
