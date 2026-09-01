const assert = require('node:assert/strict');
const { test } = require('node:test');

const { ForbiddenException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');

const { PermissionGuard } = require('../dist/guards/permission.guard.js');
const {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  PLATFORM_PERMISSIONS_KEY,
  SKIP_PERMISSIONS_KEY,
} = require('../dist/decorators/public.decorator.js');

/**
 * Phase 4 exit criterion: the guard test suite is green covering every
 * branch of `PermissionGuard` — default-deny, `@SkipPermissions`,
 * project-scoped `@RequirePermissions` (missing header / unknown project /
 * missing permission / granted), platform-scoped `@PlatformPermissions`
 * (missing / granted, no `x-project-id` needed), and a route declaring both.
 *
 * The guard reads ONLY `request.tokenClaims` — never re-verifies the token,
 * never calls papi-authority — so every case here is a hand-constructed
 * claims object, no live instance required.
 */

/** Builds a stub `Reflector` returning a fixed value per metadata key. */
function fakeReflector(overrides) {
  const reflector = new Reflector();
  reflector.getAllAndOverride = (key) => overrides[key];
  return reflector;
}

function contextWith(request) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function assertForbidden(fn) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.getStatus(), 403);
    return true;
  });
}

test('a route with no @RequirePermissions/@PlatformPermissions/@SkipPermissions is refused (default-deny)', () => {
  const guard = new PermissionGuard(fakeReflector({}));
  const request = { headers: {}, tokenClaims: { projects: {}, platform: { pages: [], apis: [] } } };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('@Public() passes regardless of claims', () => {
  const guard = new PermissionGuard(fakeReflector({ [IS_PUBLIC_KEY]: true }));
  const request = { headers: {} };

  assert.equal(guard.canActivate(contextWith(request)), true);
});

test('@SkipPermissions() passes regardless of claims', () => {
  const guard = new PermissionGuard(fakeReflector({ [SKIP_PERMISSIONS_KEY]: true }));
  const request = { headers: {} };

  assert.equal(guard.canActivate(contextWith(request)), true);
});

test('@RequirePermissions(...) with no x-project-id header is refused', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = {
    headers: {},
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.providers'] } },
      platform: { pages: [], apis: [] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('@RequirePermissions(...) with x-project-id not present in claims.projects is refused', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = {
    headers: { 'x-project-id': 'SOME-OTHER-PROJECT' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.providers'] } },
      platform: { pages: [], apis: [] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('@RequirePermissions(...) with the project present but the permission absent from .apis is refused', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = {
    headers: { 'x-project-id': 'PMBETTZ' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.games'] } },
      platform: { pages: [], apis: [] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('@RequirePermissions(...) with the project present and the permission present passes', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = {
    headers: { 'x-project-id': 'PMBETTZ' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.providers'] } },
      platform: { pages: [], apis: [] },
    },
  };

  assert.equal(guard.canActivate(contextWith(request)), true);
});

test('@RequirePermissions(...) checks .apis only — a matching .pages entry alone is not enough', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = {
    headers: { 'x-project-id': 'PMBETTZ' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: ['casino.providers'], apis: [] } },
      platform: { pages: [], apis: [] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('@PlatformPermissions(...) with the permission present in claims.platform.apis passes, with no x-project-id needed', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PLATFORM_PERMISSIONS_KEY]: [['adminPanels', 'view']] }),
  );
  const request = {
    headers: {},
    tokenClaims: {
      projects: {},
      platform: { pages: [], apis: ['adminPanels.view'] },
    },
  };

  assert.equal(guard.canActivate(contextWith(request)), true);
});

test('@PlatformPermissions(...) with the permission absent is refused', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PLATFORM_PERMISSIONS_KEY]: [['adminPanels', 'view']] }),
  );
  const request = {
    headers: {},
    tokenClaims: {
      projects: {},
      platform: { pages: [], apis: [] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('a route declaring BOTH @RequirePermissions and @PlatformPermissions: platform passes, project fails -> still refused', () => {
  const guard = new PermissionGuard(
    fakeReflector({
      [PLATFORM_PERMISSIONS_KEY]: [['adminPanels', 'view']],
      [PERMISSIONS_KEY]: [['casino', 'providers']],
    }),
  );
  const request = {
    headers: { 'x-project-id': 'PMBETTZ' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.games'] } }, // missing casino.providers
      platform: { pages: [], apis: ['adminPanels.view'] },
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('a route declaring BOTH @RequirePermissions and @PlatformPermissions: platform fails -> refused before the project check runs', () => {
  const guard = new PermissionGuard(
    fakeReflector({
      [PLATFORM_PERMISSIONS_KEY]: [['adminPanels', 'view']],
      [PERMISSIONS_KEY]: [['casino', 'providers']],
    }),
  );
  const request = {
    headers: {}, // no x-project-id at all — if the project check ran first, this would fail for a different reason
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.providers'] } },
      platform: { pages: [], apis: [] }, // missing adminPanels.view
    },
  };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('a route declaring BOTH @RequirePermissions and @PlatformPermissions: both pass -> passes', () => {
  const guard = new PermissionGuard(
    fakeReflector({
      [PLATFORM_PERMISSIONS_KEY]: [['adminPanels', 'view']],
      [PERMISSIONS_KEY]: [['casino', 'providers']],
    }),
  );
  const request = {
    headers: { 'x-project-id': 'PMBETTZ' },
    tokenClaims: {
      projects: { PMBETTZ: { pages: [], apis: ['casino.providers'] } },
      platform: { pages: [], apis: ['adminPanels.view'] },
    },
  };

  assert.equal(guard.canActivate(contextWith(request)), true);
});

test('no tokenClaims on the request at all is refused (JwtGuard must run first)', () => {
  const guard = new PermissionGuard(
    fakeReflector({ [PERMISSIONS_KEY]: [['casino', 'providers']] }),
  );
  const request = { headers: { 'x-project-id': 'PMBETTZ' } };

  assertForbidden(() => guard.canActivate(contextWith(request)));
});

test('PERMISSIONS_KEY/PLATFORM_PERMISSIONS_KEY/SKIP_PERMISSIONS_KEY match what the guard actually reads', () => {
  // Guards against the decorator and the guard silently drifting apart on
  // the metadata key strings — and keeps this service's convention
  // identical to papi-authority's own (`papi:permissions`,
  // `papi:platformPermissions`, `papi:skipPermissions`).
  assert.equal(PERMISSIONS_KEY, 'papi:permissions');
  assert.equal(PLATFORM_PERMISSIONS_KEY, 'papi:platformPermissions');
  assert.equal(SKIP_PERMISSIONS_KEY, 'papi:skipPermissions');
});
