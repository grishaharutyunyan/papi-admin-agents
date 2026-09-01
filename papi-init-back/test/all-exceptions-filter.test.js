const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} = require('@nestjs/common');

const { AllExceptionsFilter } = require('../dist/core/errors/all-exceptions.filter.js');

/**
 * Exercises the Phase 1 exit criterion directly: "a deliberately-thrown
 * business exception's message reaches the client unchanged; a
 * hand-constructed exception wrapping a raw internal string does NOT — the
 * client sees the generic message + a request-id; the raw string shows up in
 * the server log instead." Runs against `dist/`, same reason as
 * `redaction.test.js`.
 */

function fakeRequest(overrides = {}) {
  return { headers: {}, method: 'GET', originalUrl: '/api/app-init', url: '/api/app-init', ...overrides };
}

function fakeResponse() {
  const calls = {};
  const res = {
    status(code) {
      calls.status = code;
      return res;
    },
    type(t) {
      calls.type = t;
      return res;
    },
    json(body) {
      calls.body = body;
      return res;
    },
  };
  return { res, calls };
}

function fakeHost(request, response) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
}

test('a deliberately-thrown business exception (4xx) reaches the client unchanged', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest();
  const { res, calls } = fakeResponse();

  filter.catch(new ForbiddenException('SSO is disabled for this panel.'), fakeHost(request, res));

  assert.equal(calls.status, 403);
  assert.equal(calls.type, 'application/problem+json');
  assert.equal(calls.body.detail, 'SSO is disabled for this panel.');
  assert.equal(typeof calls.body.instance, 'string');
  assert.ok(calls.body.instance.length > 0);
});

test('DTO validation failures (ValidationPipe shape) pass through structured', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest();
  const { res, calls } = fakeResponse();

  filter.catch(
    new BadRequestException(['limit must not be greater than 200']),
    fakeHost(request, res),
  );

  assert.equal(calls.status, 400);
  assert.deepEqual(calls.body.errors, ['limit must not be greater than 200']);
});

test('a hand-constructed 5xx built from a caught error\'s raw text does NOT reach the client — the raw text is logged instead', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest();
  const { res, calls } = fakeResponse();

  const rawInternalSecret = 'ECONNREFUSED 10.0.0.7:3306 — password=hunter2';
  const captured = [];
  const originalError = Logger.prototype.error;
  Logger.prototype.error = function patched(message) {
    captured.push(message);
  };

  try {
    filter.catch(new InternalServerErrorException(rawInternalSecret), fakeHost(request, res));
  } finally {
    Logger.prototype.error = originalError;
  }

  assert.equal(calls.status, 500);
  assert.equal(calls.body.detail, 'An unexpected error occurred.');
  assert.notEqual(calls.body.detail, rawInternalSecret);
  assert.ok(!JSON.stringify(calls.body).includes('hunter2'), 'raw internal text leaked to the client');
  assert.ok(
    captured.some((line) => line.includes(rawInternalSecret)),
    'the raw internal text was not logged server-side',
  );
});

test('an uncaught non-HttpException error also collapses to the generic 500 message', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest();
  const { res, calls } = fakeResponse();
  const originalError = Logger.prototype.error;
  Logger.prototype.error = () => {};

  try {
    filter.catch(new TypeError('Cannot read properties of undefined'), fakeHost(request, res));
  } finally {
    Logger.prototype.error = originalError;
  }

  assert.equal(calls.status, 500);
  assert.equal(calls.body.detail, 'An unexpected error occurred.');
});

test('a body-parser-style SyntaxError never echoes a raw body snippet into the server log (Phase 7 audit finding)', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest();
  const { res, calls } = fakeResponse();

  // Mirrors what express.json()/body-parser actually throws for malformed
  // JSON: a bare SyntaxError from JSON.parse. V8's own message for this can
  // quote a snippet of the exact input text that failed to parse.
  let secretLeakingError;
  try {
    // A body that is invalid JSON from its very first character makes V8
    // quote a snippet of it verbatim in the SyntaxError message — the
    // realistic case is a caller who forgot to JSON-encode a password field
    // at all and posted something like this as the raw body.
    JSON.parse('hunter2longenoughtobeechoed is not json');
  } catch (err) {
    secretLeakingError = err;
  }
  assert.ok(secretLeakingError instanceof SyntaxError);
  assert.ok(
    secretLeakingError.message.includes('hunter2'),
    'test setup assumption broken: this Node version does not echo source text into JSON.parse SyntaxErrors',
  );

  const captured = [];
  const originalError = Logger.prototype.error;
  Logger.prototype.error = function patched(message) {
    captured.push(message);
  };

  try {
    filter.catch(secretLeakingError, fakeHost(request, res));
  } finally {
    Logger.prototype.error = originalError;
  }

  assert.equal(calls.status, 500);
  assert.equal(calls.body.detail, 'An unexpected error occurred.');
  assert.ok(
    !captured.some((line) => line.includes('hunter2')),
    'a raw request-body fragment leaked into the server log via a SyntaxError message',
  );
});

test('reuses a well-formed inbound x-request-id as the problem instance', () => {
  const filter = new AllExceptionsFilter();
  const request = fakeRequest({ headers: { 'x-request-id': 'req-fixed-123' } });
  const { res, calls } = fakeResponse();

  filter.catch(new ForbiddenException('static message'), fakeHost(request, res));

  assert.equal(calls.body.instance, 'req-fixed-123');
});
