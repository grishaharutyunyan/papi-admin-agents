const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');

const {
  postToPapiAuthority,
  getFromPapiAuthority,
  patchToPapiAuthority,
  UpstreamTrustedError,
  UpstreamCollapsedError,
} = require('../dist/core/http/papi-authority-caller.js');

/**
 * Phase 3's two-class error contract (papi-init-back/CLAUDE.md, dossier 0.63):
 * a classifiable 4xx from papi-authority throws `UpstreamTrustedError`
 * (message safe to forward unchanged); everything else — network failure,
 * timeout, non-JSON body, a 5xx, or an unrecognized 4xx shape — throws
 * `UpstreamCollapsedError`. This is pure, deterministic logic with no need
 * for a live papi-authority instance to exercise every branch.
 */

let originalFetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('a 2xx resolves with the parsed body', async () => {
  global.fetch = async () => jsonResponse(200, { accessToken: 'x' });

  const result = await postToPapiAuthority('http://localhost:7780', {
    path: '/api/auth/login',
    body: { username: 'a', password: 'b' },
  });

  assert.deepEqual(result, { status: 200, body: { accessToken: 'x' } });
});

test('a 204 resolves with a null body (logout)', async () => {
  global.fetch = async () => ({ ok: true, status: 204 });

  const result = await postToPapiAuthority('http://localhost:7780', {
    path: '/api/auth/logout',
    body: { refreshToken: 'x' },
  });

  assert.deepEqual(result, { status: 204, body: null });
});

test('a 4xx with a string `message` throws UpstreamTrustedError, forwarding the message', async () => {
  global.fetch = async () =>
    jsonResponse(403, { statusCode: 403, message: 'Password authentication is disabled for this panel.' });

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamTrustedError);
      assert.equal(err.status, 403);
      assert.equal(err.message, 'Password authentication is disabled for this panel.');
      return true;
    },
  );
});

test('a 4xx with an array `message` (validation errors) joins into UpstreamTrustedError', async () => {
  global.fetch = async () =>
    jsonResponse(400, { statusCode: 400, message: ['username must be a string', 'password should not be empty'] });

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamTrustedError);
      assert.equal(err.status, 400);
      assert.equal(err.message, 'username must be a string password should not be empty');
      return true;
    },
  );
});

test('a 4xx with no recognizable `message` shape collapses instead of guessing', async () => {
  global.fetch = async () => jsonResponse(401, { unexpected: 'shape' });

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamCollapsedError);
      assert.ok(!(err instanceof UpstreamTrustedError));
      return true;
    },
  );
});

test('a 5xx always collapses, even with a well-shaped message', async () => {
  global.fetch = async () => jsonResponse(500, { statusCode: 500, message: 'Internal server error' });

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamCollapsedError);
      return true;
    },
  );
});

test('a network failure (fetch throws) collapses, never surfacing the raw error', async () => {
  global.fetch = async () => {
    throw new TypeError('fetch failed: ECONNREFUSED');
  };

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamCollapsedError);
      assert.ok(!(err instanceof UpstreamTrustedError));
      return true;
    },
  );
});

test('a non-JSON body collapses rather than throwing the JSON parse error raw', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
  });

  await assert.rejects(
    () => postToPapiAuthority('http://localhost:7780', { path: '/api/auth/login', body: {} }),
    (err) => {
      assert.ok(err instanceof UpstreamCollapsedError);
      return true;
    },
  );
});

test('a timeout (AbortController fires) collapses', async () => {
  global.fetch = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });

  await assert.rejects(
    () =>
      postToPapiAuthority('http://localhost:7780', {
        path: '/api/auth/login',
        body: {},
        timeoutMs: 10,
      }),
    (err) => {
      assert.ok(err instanceof UpstreamCollapsedError);
      return true;
    },
  );
});

test('outbound headers (X-Forwarded-For, x-admin-panel-key) are actually sent', async () => {
  let seenHeaders;
  global.fetch = async (url, init) => {
    seenHeaders = init.headers;
    return jsonResponse(200, { accessToken: 'x' });
  };

  await postToPapiAuthority('http://localhost:7780', {
    path: '/api/auth/refresh',
    body: { refreshToken: 'x' },
    headers: { 'X-Forwarded-For': '203.0.113.7', 'x-admin-panel-key': 'RMP' },
  });

  assert.equal(seenHeaders['X-Forwarded-For'], '203.0.113.7');
  assert.equal(seenHeaders['x-admin-panel-key'], 'RMP');
  assert.equal(seenHeaders['content-type'], 'application/json');
});

/**
 * Phase 5 additions: GET/PATCH support and forwarding the caller's own
 * `Authorization` header — needed because `users/me*` proxies (unlike
 * Phase 3's login/refresh/sso, which never had an inbound token) always have
 * one to forward.
 */

test('getFromPapiAuthority issues a GET with no body', async () => {
  let seenMethod;
  let seenBody;
  global.fetch = async (url, init) => {
    seenMethod = init.method;
    seenBody = init.body;
    return jsonResponse(200, { id: 'u1' });
  };

  const result = await getFromPapiAuthority('http://localhost:7780', {
    path: '/api/users/me',
    headers: { Authorization: 'Bearer abc' },
  });

  assert.equal(seenMethod, 'GET');
  assert.equal(seenBody, undefined);
  assert.deepEqual(result, { status: 200, body: { id: 'u1' } });
});

test('getFromPapiAuthority forwards the caller Authorization header unchanged', async () => {
  let seenHeaders;
  global.fetch = async (url, init) => {
    seenHeaders = init.headers;
    return jsonResponse(200, { id: 'u1' });
  };

  await getFromPapiAuthority('http://localhost:7780', {
    path: '/api/users/me/projects',
    headers: { Authorization: 'Bearer some.jwt.token' },
  });

  assert.equal(seenHeaders['Authorization'], 'Bearer some.jwt.token');
});

test('patchToPapiAuthority issues a PATCH carrying the body', async () => {
  let seenMethod;
  let seenBody;
  global.fetch = async (url, init) => {
    seenMethod = init.method;
    seenBody = init.body;
    return jsonResponse(200, { id: 'u1', firstName: 'Ada' });
  };

  const result = await patchToPapiAuthority('http://localhost:7780', {
    path: '/api/users/me',
    body: { firstName: 'Ada' },
    headers: { Authorization: 'Bearer abc' },
  });

  assert.equal(seenMethod, 'PATCH');
  assert.equal(seenBody, JSON.stringify({ firstName: 'Ada' }));
  assert.deepEqual(result, { status: 200, body: { id: 'u1', firstName: 'Ada' } });
});

test('a trusted 4xx from a GET call (e.g. an expired token) still classifies as UpstreamTrustedError', async () => {
  global.fetch = async () => jsonResponse(401, { statusCode: 401, message: 'Unauthorized' });

  await assert.rejects(
    () =>
      getFromPapiAuthority('http://localhost:7780', {
        path: '/api/users/me',
        headers: { Authorization: 'Bearer expired' },
      }),
    (err) => {
      assert.ok(err instanceof UpstreamTrustedError);
      assert.equal(err.status, 401);
      assert.equal(err.message, 'Unauthorized');
      return true;
    },
  );
});
