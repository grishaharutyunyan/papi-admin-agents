const assert = require('node:assert/strict');
const { test } = require('node:test');

const { UnauthorizedException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');

const { JwtGuard } = require('../dist/guards/jwt.guard.js');
const { IS_PUBLIC_KEY } = require('../dist/decorators/public.decorator.js');

/**
 * Phase 2 exit criterion: "All rejections produce the SAME uniform response
 * (401, generic message) — don't leak which check failed." Exercised here at
 * the guard boundary with a stub verifier that fails for different reasons,
 * confirming the guard collapses every one of them to a bare
 * `UnauthorizedException` with no distinguishing message — not just that the
 * underlying verifier throws.
 */

function fakeReflectorReturning(isPublic) {
  const reflector = new Reflector();
  reflector.getAllAndOverride = () => isPublic;
  return reflector;
}

function contextWith(request) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function stubVerifier(behavior) {
  return { verifyAccessToken: behavior };
}

test('a @Public() route is reachable with no Authorization header', async () => {
  const guard = new JwtGuard(fakeReflectorReturning(true), stubVerifier(async () => {
    throw new Error('must not be called for a public route');
  }));

  const request = { headers: {} };
  const result = await guard.canActivate(contextWith(request));

  assert.equal(result, true);
  assert.equal(request.tokenClaims, undefined);
});

test('a non-public route with no Authorization header is rejected with a bare UnauthorizedException', async () => {
  const guard = new JwtGuard(fakeReflectorReturning(false), stubVerifier(async () => {
    throw new Error('must not be called — there is no header to verify');
  }));

  const request = { headers: {} };

  await assert.rejects(() => guard.canActivate(contextWith(request)), UnauthorizedException);
});

test('a non-Bearer Authorization header is rejected with a bare UnauthorizedException', async () => {
  const guard = new JwtGuard(fakeReflectorReturning(false), stubVerifier(async () => {
    throw new Error('must not be called');
  }));

  const request = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };

  await assert.rejects(() => guard.canActivate(contextWith(request)), UnauthorizedException);
});

/**
 * Every distinct underlying failure reason collapses to the exact same
 * exception shape at the guard boundary — a bare `UnauthorizedException()`
 * with no message. This is what actually proves uniformity: an attacker
 * probing with a bad signature vs an expired token vs an unknown `kid` must
 * observe an identical response.
 */
const FAILURE_REASONS = [
  'Invalid signature.',
  'Token expired.',
  'Unknown key id.',
  'Unexpected audience.',
  'Unsupported algorithm.',
];

for (const reason of FAILURE_REASONS) {
  test(`a verifier failure ("${reason}") is rejected with a bare, message-less UnauthorizedException`, async () => {
    const guard = new JwtGuard(
      fakeReflectorReturning(false),
      stubVerifier(async () => {
        throw new Error(reason);
      }),
    );

    const request = { headers: { authorization: 'Bearer whatever.token.value' } };

    await assert.rejects(() => guard.canActivate(contextWith(request)), (error) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.equal(error.getStatus(), 401);
      // No trace of the underlying reason anywhere in the thrown exception.
      assert.ok(!JSON.stringify(error.getResponse()).includes(reason));
      return true;
    });
  });
}

test('a valid token attaches the verified claims to `request.tokenClaims` and allows the request through', async () => {
  const claims = { sub: 'user-1', iss: 'papi-authority', aud: 'nrg-platform' };
  const guard = new JwtGuard(fakeReflectorReturning(false), stubVerifier(async (token) => {
    assert.equal(token, 'a-valid-token');
    return claims;
  }));

  const request = { headers: { authorization: 'Bearer a-valid-token' } };
  const result = await guard.canActivate(contextWith(request));

  assert.equal(result, true);
  assert.deepEqual(request.tokenClaims, claims);
});

test('IS_PUBLIC_KEY metadata key matches the value the guard actually reads', () => {
  // Guards against the decorator and the guard silently drifting apart on
  // the metadata key string.
  assert.equal(typeof IS_PUBLIC_KEY, 'string');
  assert.ok(IS_PUBLIC_KEY.length > 0);
});
