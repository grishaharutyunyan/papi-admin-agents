const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  redact,
  redactHeaders,
  isSensitiveKey,
  REDACTED,
} = require('../dist/core/redaction/redact.js');

/**
 * Tests run against `dist/`, not `src/` — the `$/` path alias is rewritten by
 * the Nest CLI at emit, so any non-Nest entrypoint must use compiled output.
 * This is the same reason `seed`, `migration:*` and `permissions:check` all
 * build first (see CLAUDE.md).
 *
 * Node's built-in runner is used deliberately: no test framework is added to a
 * service whose dependency hygiene is itself a security property.
 */

test('redacts every credential-bearing field name we actually use', () => {
  const input = {
    password: 'hunter2',
    newPassword: 'hunter3',
    currentPassword: 'hunter1',
    temporaryPassword: 'temp',
    refreshToken: 'rt',
    accessToken: 'at',
    azureToken: 'az',
    tokenHash: 'abc',
    clientSecret: 'cs',
    apiKey: 'k',
    connectionString: 'Endpoint=…;AccessKey=…',
    privateKey: '-----BEGIN…',
  };

  const output = redact(input);

  for (const key of Object.keys(input)) {
    assert.equal(output[key], REDACTED, `${key} was not redacted`);
  }
});

test('leaves non-sensitive fields untouched', () => {
  const output = redact({ username: 'admin', email: 'a@b.c', isActive: true, count: 3 });

  assert.deepEqual(output, { username: 'admin', email: 'a@b.c', isActive: true, count: 3 });
});

test('does NOT redact the exempt identifiers the audit trail needs', () => {
  // `jti` is a token IDENTIFIER, stored on purpose so an action can be traced
  // back to a session. Redacting it would break the correlation it exists for.
  assert.equal(isSensitiveKey('jti'), false);
  assert.equal(isSensitiveKey('tokenEpoch'), false);

  const output = redact({ jti: 'abc-123', tokenEpoch: 4 });
  assert.deepEqual(output, { jti: 'abc-123', tokenEpoch: 4 });
});

test('matches on substring and is case-insensitive', () => {
  assert.equal(isSensitiveKey('PASSWORD'), true);
  assert.equal(isSensitiveKey('user_password_hash'), true);
  assert.equal(isSensitiveKey('X-Api-Key'.replace(/-/g, '')), true);
});

test('redacts through nesting and arrays', () => {
  const output = redact({
    user: { name: 'a', password: 'p' },
    sessions: [{ refreshToken: 'r1' }, { refreshToken: 'r2' }],
  });

  assert.equal(output.user.password, REDACTED);
  assert.equal(output.user.name, 'a');
  assert.equal(output.sessions[0].refreshToken, REDACTED);
  assert.equal(output.sessions[1].refreshToken, REDACTED);
});

test('never mutates its input', () => {
  const input = { password: 'hunter2', nested: { token: 't' } };
  const copy = structuredClone(input);

  redact(input);

  assert.deepEqual(input, copy, 'redact mutated the object it was given');
});

test('survives cycles instead of throwing', () => {
  // A redactor that throws inside an error handler turns a logged problem
  // into an unlogged one.
  const input = { name: 'root', password: 'p' };
  input.self = input;

  const output = redact(input);

  assert.equal(output.password, REDACTED);
  assert.equal(output.self, '[circular]');
});

test('bounds depth rather than recursing forever', () => {
  let deep = { value: 'bottom' };
  for (let i = 0; i < 20; i += 1) deep = { nested: deep };

  assert.doesNotThrow(() => redact(deep));
});

test('reduces an Error to name and message', () => {
  const error = new Error('boom');
  error.password = 'leaked';

  assert.deepEqual(redact({ error }).error, { name: 'Error', message: 'boom' });
});

test('redacts hyphenated headers', () => {
  const output = redactHeaders({
    authorization: 'Bearer abc',
    cookie: 'session=1',
    'x-api-key': 'k',
    'user-agent': 'curl/8',
    'x-request-id': 'r-1',
  });

  assert.equal(output.authorization, REDACTED);
  assert.equal(output.cookie, REDACTED);
  assert.equal(output['x-api-key'], REDACTED);
  assert.equal(output['user-agent'], 'curl/8');
  assert.equal(output['x-request-id'], 'r-1');
});
