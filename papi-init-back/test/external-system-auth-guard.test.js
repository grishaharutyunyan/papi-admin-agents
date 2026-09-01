const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');

const { UnauthorizedException } = require('@nestjs/common');

const { ExternalSystemAuthGuard } = require('../dist/guards/external-system-auth.guard.js');

/**
 * Phase 6 exit criteria this file proves directly:
 *  - valid key passes
 *  - wrong key of the same length is rejected
 *  - wrong key of a different length is rejected
 *  - the comparison actually calls `crypto.timingSafeEqual` — not `===`/`!==`
 *    — verified by monkey-patching the SAME `node:crypto` module object the
 *    compiled guard itself calls through (`require('node:crypto')` returns
 *    Node's single cached module instance, so this patch is observed by the
 *    guard's own `timingSafeEqual` reference resolved at call time).
 */

const EXPECTED_KEY = 'a-real-32-char-api-key-value!!!';

function contextWithHeader(headerValue) {
  const request = { headers: headerValue === undefined ? {} : { apikey: headerValue } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

test('the correct key passes', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });
  assert.equal(guard.canActivate(contextWithHeader(EXPECTED_KEY)), true);
});

test('a wrong key of the SAME length is rejected', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });
  const wrongSameLength = 'b'.repeat(EXPECTED_KEY.length);

  assert.throws(
    () => guard.canActivate(contextWithHeader(wrongSameLength)),
    (error) => error instanceof UnauthorizedException,
  );
});

test('a wrong key of a DIFFERENT length is rejected', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });

  assert.throws(
    () => guard.canActivate(contextWithHeader('short')),
    (error) => error instanceof UnauthorizedException,
  );
});

test('a missing apikey header is rejected', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });

  assert.throws(
    () => guard.canActivate(contextWithHeader(undefined)),
    (error) => error instanceof UnauthorizedException,
  );
});

test('the comparison uses crypto.timingSafeEqual, not ===/!== — proven by intercepting the real function', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });
  const original = crypto.timingSafeEqual;
  let called = false;
  let calledWith;

  crypto.timingSafeEqual = (a, b) => {
    called = true;
    calledWith = [a, b];
    return original(a, b);
  };

  try {
    const result = guard.canActivate(contextWithHeader(EXPECTED_KEY));
    assert.equal(result, true);
  } finally {
    crypto.timingSafeEqual = original;
  }

  assert.equal(called, true, 'expected crypto.timingSafeEqual to be called for a same-length comparison');
  assert.ok(Buffer.isBuffer(calledWith[0]));
  assert.ok(Buffer.isBuffer(calledWith[1]));
});

test('a same-length WRONG key still goes through crypto.timingSafeEqual (never a manual byte/string compare)', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });
  const original = crypto.timingSafeEqual;
  let called = false;

  crypto.timingSafeEqual = (a, b) => {
    called = true;
    return original(a, b);
  };

  try {
    assert.throws(() => guard.canActivate(contextWithHeader('c'.repeat(EXPECTED_KEY.length))));
  } finally {
    crypto.timingSafeEqual = original;
  }

  assert.equal(called, true);
});

test('a DIFFERENT-length key rejects WITHOUT calling crypto.timingSafeEqual (it throws on mismatched lengths, so the length check must run first)', () => {
  const guard = new ExternalSystemAuthGuard({ apiKey: EXPECTED_KEY });
  const original = crypto.timingSafeEqual;
  let called = false;

  crypto.timingSafeEqual = (a, b) => {
    called = true;
    return original(a, b);
  };

  try {
    assert.throws(() => guard.canActivate(contextWithHeader('short')));
  } finally {
    crypto.timingSafeEqual = original;
  }

  assert.equal(called, false, 'timingSafeEqual must not be called with mismatched-length buffers');
});
