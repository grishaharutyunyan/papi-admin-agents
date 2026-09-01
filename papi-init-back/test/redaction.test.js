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
 * Copied from papi-authority's `test/redaction.test.js` (same ruleset, ported
 * verbatim — see `src/core/redaction/redact.ts`).
 */

test('redacts every credential-bearing field name we actually use', () => {
  const input = {
    password: 'hunter2',
    newPassword: 'hunter3',
    refreshToken: 'rt',
    accessToken: 'at',
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
  assert.equal(isSensitiveKey('jti'), false);
  assert.equal(isSensitiveKey('tokenEpoch'), false);
});

test('redacts through nesting and arrays', () => {
  const output = redact({
    user: { name: 'a', password: 'p' },
    sessions: [{ refreshToken: 'r1' }, { refreshToken: 'r2' }],
  });

  assert.equal(output.user.password, REDACTED);
  assert.equal(output.user.name, 'a');
  assert.equal(output.sessions[0].refreshToken, REDACTED);
});

test('reduces an Error to name and message', () => {
  const error = new Error('boom');
  error.password = 'leaked';

  assert.deepEqual(redact({ error }).error, { name: 'Error', message: 'boom' });
});

test('redacts hyphenated headers but leaves x-request-id and user-agent alone', () => {
  const output = redactHeaders({
    authorization: 'Bearer abc',
    'x-api-key': 'k',
    'user-agent': 'curl/8',
    'x-request-id': 'r-1',
  });

  assert.equal(output.authorization, REDACTED);
  assert.equal(output['x-api-key'], REDACTED);
  assert.equal(output['user-agent'], 'curl/8');
  assert.equal(output['x-request-id'], 'r-1');
});
