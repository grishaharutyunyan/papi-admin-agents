const assert = require('node:assert/strict');
const { test } = require('node:test');

const { Logger } = require('@nestjs/common');

const { HttpClientService, HttpClientError } = require('../dist/core/http-client/http-client.service.js');

/**
 * Phase 6 exit criterion: "a failed call through the shared HTTP client
 * never appears in logs with a request body." This suite proves it against
 * a captured `Logger.error` call (same technique as
 * `all-exceptions-filter.test.js`), not merely by reading the source.
 */

function withMockedFetch(responder, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = responder;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

function withCapturedLoggerError(fn) {
  const captured = [];
  const original = Logger.prototype.error;
  Logger.prototype.error = function patched(message) {
    captured.push(message);
  };
  return fn(captured).finally(() => {
    Logger.prototype.error = original;
  });
}

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('a successful GET returns the parsed body and real status', async () => {
  const service = new HttpClientService();

  await withMockedFetch(
    async () => jsonResponse(200, { ok: true }),
    async () => {
      const result = await service.get('https://example.internal/api/thing');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { ok: true });
    },
  );
});

test('a successful POST sends the body as JSON and returns the parsed response', async () => {
  const service = new HttpClientService();
  let capturedInit;

  await withMockedFetch(
    async (_url, init) => {
      capturedInit = init;
      return jsonResponse(201, { id: 42 });
    },
    async () => {
      const result = await service.post('https://example.internal/api/things', { name: 'x' });
      assert.equal(result.status, 201);
      assert.deepEqual(result.body, { id: 42 });
    },
  );

  assert.equal(capturedInit.method, 'POST');
  assert.deepEqual(JSON.parse(capturedInit.body), { name: 'x' });
});

test('a 401 preserves the REAL upstream status code — never collapsed to a generic 400', async () => {
  const service = new HttpClientService();

  await withCapturedLoggerError((captured) =>
    withMockedFetch(
      async () => jsonResponse(401, { message: 'Invalid credentials.' }),
      async () => {
        await assert.rejects(
          () => service.get('https://example.internal/api/secret'),
          (error) => error instanceof HttpClientError && error.status === 401,
        );
        assert.ok(captured.length > 0);
      },
    ),
  );
});

test('a 500 preserves the real status too (not collapsed to a generic client-side code)', async () => {
  const service = new HttpClientService();

  await withCapturedLoggerError(() =>
    withMockedFetch(
      async () => jsonResponse(500, { message: 'boom' }),
      async () => {
        await assert.rejects(
          () => service.get('https://example.internal/api/thing'),
          (error) => error instanceof HttpClientError && error.status === 500,
        );
      },
    ),
  );
});

test('a network failure surfaces status=undefined, never a guessed status', async () => {
  const service = new HttpClientService();

  await withCapturedLoggerError(() =>
    withMockedFetch(
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => {
        await assert.rejects(
          () => service.get('https://example.internal/api/thing'),
          (error) => error instanceof HttpClientError && error.status === undefined,
        );
      },
    ),
  );
});

test('a failed call NEVER logs the request or response body content — a secret in either never appears in the log line', async () => {
  const service = new HttpClientService();
  const secretPassword = 'S3cr3tPassw0rd!!';
  const secretUpstreamDetail = 'db user=root password=hunter2-upstream-secret';

  await withCapturedLoggerError((captured) =>
    withMockedFetch(
      async () => jsonResponse(401, { message: secretUpstreamDetail }),
      async () => {
        await assert.rejects(() =>
          service.post('https://example.internal/api/auth/login', {
            username: 'admin',
            password: secretPassword,
          }),
        );

        assert.ok(captured.length > 0, 'expected the failure to be logged at all');
        const logged = captured.join('\n');
        assert.ok(!logged.includes(secretPassword), 'the outbound request body leaked into the log');
        assert.ok(!logged.includes(secretUpstreamDetail), 'the upstream response body leaked into the log');
        // What SHOULD be present: method, a path, and the status.
        assert.ok(logged.includes('POST'));
        assert.ok(logged.includes('/api/auth/login'));
        assert.ok(logged.includes('401'));
      },
    ),
  );
});

test('the logged URL strips query string and userinfo — a credential passed via the URL itself is not logged either', async () => {
  const service = new HttpClientService();

  await withCapturedLoggerError((captured) =>
    withMockedFetch(
      async () => jsonResponse(500, {}),
      async () => {
        await assert.rejects(() =>
          service.get('https://user:leaked-secret@example.internal/api/thing?apiKey=leaked-query-secret'),
        );

        const logged = captured.join('\n');
        assert.ok(!logged.includes('leaked-secret'));
        assert.ok(!logged.includes('leaked-query-secret'));
        assert.ok(logged.includes('/api/thing'));
      },
    ),
  );
});

test('a non-JSON success body is treated as a failure, without leaking the raw text', async () => {
  const service = new HttpClientService();

  await withCapturedLoggerError((captured) =>
    withMockedFetch(
      async () => new Response('<html>not json, secret=abc123</html>', { status: 200 }),
      async () => {
        await assert.rejects(
          () => service.get('https://example.internal/api/thing'),
          (error) => error instanceof HttpClientError,
        );
        const logged = captured.join('\n');
        assert.ok(!logged.includes('secret=abc123'));
      },
    ),
  );
});

test('a 204-style empty body resolves to a null body, not an error', async () => {
  const service = new HttpClientService();

  await withMockedFetch(
    async () => new Response(null, { status: 204 }),
    async () => {
      const result = await service.delete('https://example.internal/api/thing/1');
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
    },
  );
});
