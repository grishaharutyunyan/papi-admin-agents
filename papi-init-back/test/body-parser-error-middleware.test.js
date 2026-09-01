const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  bodyParserErrorMiddleware,
} = require('../dist/core/http/body-parser-error-middleware.js');

/**
 * Live capstone finding, Phase 7 (2026-08-31): a malformed JSON body's
 * SyntaxError message echoes a snippet of the caller's own raw request —
 * verified empirically (see the module's own doc comment) and confirmed live
 * against a running instance before this fix. This test proves the
 * neutralization without needing a live server: it constructs the exact
 * error shape body-parser produces (a SyntaxError with `status === 400`,
 * matching the `http-errors` library's shape) and checks what's passed to
 * `next()`.
 */

function bodyParserStyleSyntaxError(message) {
  const err = new SyntaxError(message);
  Object.assign(err, { status: 400, statusCode: 400, expose: true, type: 'entity.parse.failed' });
  return err;
}

test('neutralizes a body-parser SyntaxError, replacing the message but keeping status 400', () => {
  const leaky = bodyParserStyleSyntaxError(
    "Unexpected token 'h', \"hunter2lon\"... is not valid JSON",
  );
  let forwarded;

  bodyParserErrorMiddleware(leaky, {}, {}, (err) => {
    forwarded = err;
  });

  assert.ok(forwarded instanceof SyntaxError);
  assert.equal(forwarded.message, 'Malformed JSON in request body.');
  assert.ok(!forwarded.message.includes('hunter2'), 'the raw body snippet must not survive');
  assert.equal(forwarded.status, 400);
  assert.equal(forwarded.statusCode, 400);
});

test('passes through any error that is NOT a body-parser-shaped SyntaxError, unchanged', () => {
  const ordinary = new Error('some other failure');
  let forwarded;

  bodyParserErrorMiddleware(ordinary, {}, {}, (err) => {
    forwarded = err;
  });

  assert.equal(forwarded, ordinary);
});

test('passes through a SyntaxError that lacks the body-parser status shape, unchanged', () => {
  // A SyntaxError thrown by application code (not body-parsing) has no
  // `.status` — must not be neutralized, since it never carried request
  // content and neutralizing it would hide a real application bug.
  const applicationSyntaxError = new SyntaxError('some unrelated syntax issue');
  let forwarded;

  bodyParserErrorMiddleware(applicationSyntaxError, {}, {}, (err) => {
    forwarded = err;
  });

  assert.equal(forwarded, applicationSyntaxError);
});

test('does not call next() with no arguments — it always forwards something', () => {
  let callCount = 0;
  let lastArgs;

  bodyParserErrorMiddleware(bodyParserStyleSyntaxError('x'), {}, {}, (...args) => {
    callCount += 1;
    lastArgs = args;
  });

  assert.equal(callCount, 1);
  assert.equal(lastArgs.length, 1);
  assert.ok(lastArgs[0] !== undefined);
});
