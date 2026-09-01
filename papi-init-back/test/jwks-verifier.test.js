const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { test } = require('node:test');

const jwt = require('jsonwebtoken');

const { JwksVerifierService } = require('../dist/core/jwks/jwks-verifier.service.js');
const { isAccessTokenClaims } = require('../dist/constants/interfaces/token-claims.interface.js');

/**
 * Phase 2 exit criterion: "an expired, tampered, or wrong-audience token is
 * rejected with a uniform 401" plus "a token minted by a real papi-authority
 * instance verifies here and matches AccessTokenClaims field-for-field."
 *
 * Tests run against `dist/`, same reason as every other suite in this repo
 * (the `$/` alias is rewritten at Nest-CLI emit, not by `tsc`).
 *
 * Two keypairs are used throughout:
 *  - `signingKey` — published in the fake JWKS server below, the ONLY key a
 *    correctly-configured verifier should ever accept.
 *  - `otherKey` — never published, used to prove an unknown `kid` (or a
 *    signature from a key we never advertised) is rejected outright rather
 *    than the verifier falling back to "try every key".
 */

const EXPECTED_ISSUER = 'papi-authority';
const EXPECTED_AUDIENCE = 'nrg-platform';

const signingKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const SIGNING_KID = 'test-signing-key-1';
const OTHER_KID = 'unpublished-key-1';

function jwkFor(publicKey, kid) {
  const jwk = publicKey.export({ format: 'jwk' });
  return { ...jwk, kid, use: 'sig', alg: 'RS256' };
}

/** Minimal stand-in for papi-authority's `GET /.well-known/jwks.json`. */
function startFakeJwksServer() {
  const body = JSON.stringify({ keys: [jwkFor(signingKey.publicKey, SIGNING_KID)] });

  const server = http.createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function makeVerifier(baseUrl, overrides = {}) {
  return new JwksVerifierService(
    { panelKey: 'RMP', baseUrl },
    { issuer: EXPECTED_ISSUER, audience: EXPECTED_AUDIENCE, ...overrides },
  );
}

const BASE_CLAIMS = {
  sub: '01a05274-d182-76b9-9e98-29cfbffdb701',
  iss: EXPECTED_ISSUER,
  aud: EXPECTED_AUDIENCE,
  panel: 'RMP',
  projects: {
    'project-1': { pages: ['dashboard.dashboard'], apis: ['dashboard.view'] },
  },
  platform: { pages: [], apis: [] },
  epoch: 0,
  jti: crypto.randomUUID(),
};

function signToken({
  privateKey = signingKey.privateKey,
  kid = SIGNING_KID,
  algorithm = 'RS256',
  claims = BASE_CLAIMS,
  iat = Math.floor(Date.now() / 1000),
  exp = Math.floor(Date.now() / 1000) + 300,
} = {}) {
  const payload = { ...claims, iat, exp };
  return jwt.sign(payload, privateKey, {
    algorithm,
    header: { kid, typ: 'JWT' },
    // `iat`/`exp` are fully controlled by the caller (so an expired-token
    // test can set `exp` in the past) — `noTimestamp` must NOT be used here:
    // jsonwebtoken's own `sign.js` unconditionally `delete`s `payload.iat`
    // when it is set, even when `iat` was explicitly provided.
  });
}

test('a validly-signed, current token verifies and the claims match AccessTokenClaims field-for-field', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    const token = signToken();

    const claims = await verifier.verifyAccessToken(token);

    assert.ok(isAccessTokenClaims(claims), 'returned claims do not satisfy AccessTokenClaims');
    assert.equal(claims.sub, BASE_CLAIMS.sub);
    assert.equal(claims.iss, EXPECTED_ISSUER);
    assert.equal(claims.aud, EXPECTED_AUDIENCE);
    assert.equal(claims.panel, 'RMP');
    assert.deepEqual(claims.projects, BASE_CLAIMS.projects);
    assert.deepEqual(claims.platform, BASE_CLAIMS.platform);
    assert.equal(claims.epoch, 0);
    assert.equal(claims.jti, BASE_CLAIMS.jti);
    assert.equal(typeof claims.iat, 'number');
    assert.equal(typeof claims.exp, 'number');
  } finally {
    await stopServer(server);
  }
});

test('an expired token is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    const token = signToken({
      iat: Math.floor(Date.now() / 1000) - 600,
      exp: Math.floor(Date.now() / 1000) - 1,
    });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  } finally {
    await stopServer(server);
  }
});

test('a token with a tampered signature is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    const token = signToken();
    const segments = token.split('.');

    // Flip one character in the signature segment — same header, same
    // payload, a signature that no longer matches either.
    const signature = segments[2];
    const flippedChar = signature[0] === 'A' ? 'B' : 'A';
    segments[2] = flippedChar + signature.slice(1);
    const tampered = segments.join('.');

    await assert.rejects(() => verifier.verifyAccessToken(tampered));
  } finally {
    await stopServer(server);
  }
});

test('a token with the wrong audience is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    const token = signToken({ claims: { ...BASE_CLAIMS, aud: 'some-other-platform' } });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  } finally {
    await stopServer(server);
  }
});

test('a token with the wrong issuer is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    const token = signToken({ claims: { ...BASE_CLAIMS, iss: 'some-other-issuer' } });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  } finally {
    await stopServer(server);
  }
});

test('a token whose `kid` is not published in the JWKS is rejected (never falls back to "try every key")', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    // Signed with a real RSA key, correct claims — the ONLY thing wrong is
    // that this key was never published under this `kid`.
    const token = signToken({ privateKey: otherKey.privateKey, kid: OTHER_KID });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  } finally {
    await stopServer(server);
  }
});

test('a token signed with a different algorithm (HS256, using the RSA public key as an HMAC secret) is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);

    // The classic RS256->HS256 confusion attack: sign with HS256 using the
    // (public, known) RSA public key PEM as the HMAC secret, claiming the
    // real `kid`. Rejected because the verifier pins `algorithms: ['RS256']`
    // from ITS OWN policy — never from the token header — so this is
    // structurally impossible to accept, not merely unlikely.
    const publicKeyPem = signingKey.publicKey.export({ type: 'spki', format: 'pem' });
    const payload = { ...BASE_CLAIMS, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
    const forged = jwt.sign(payload, publicKeyPem, {
      algorithm: 'HS256',
      header: { kid: SIGNING_KID, typ: 'JWT' },
    });

    await assert.rejects(() => verifier.verifyAccessToken(forged));
  } finally {
    await stopServer(server);
  }
});

test('a token that is validly signed and current, but whose payload does not carry AccessTokenClaims, is rejected', async () => {
  const { server, baseUrl } = await startFakeJwksServer();
  try {
    const verifier = makeVerifier(baseUrl);
    // Same issuer/audience/signature validity — just missing `projects`.
    const { projects: _omitted, ...incompleteClaims } = BASE_CLAIMS;
    const token = signToken({ claims: incompleteClaims });

    await assert.rejects(() => verifier.verifyAccessToken(token));
  } finally {
    await stopServer(server);
  }
});

/**
 * The real round-trip: a token minted by an ACTUALLY RUNNING papi-authority
 * instance, verified here against ITS real JWKS endpoint.
 *
 * Kept opt-in via `LIVE_PAPI_AUTHORITY_TOKEN` / `LIVE_PAPI_AUTHORITY_BASE_URL`
 * rather than a hardcoded local login: papi-authority's own seeder does not
 * set a password (dossier 0.34's note), so there is no fixed credential a
 * future session could rely on, and this suite must stay hermetic by default
 * (no external service dependency) for anyone running `npm test` without a
 * local papi-authority up. When the env vars ARE set, this is the
 * un-mocked exit-criterion check; when they are not, the test explicitly
 * skips and says why, rather than silently passing.
 */
test('a token minted by a real, running papi-authority instance verifies here', async (t) => {
  const token = process.env.LIVE_PAPI_AUTHORITY_TOKEN;
  const baseUrl = process.env.LIVE_PAPI_AUTHORITY_BASE_URL;
  const issuer = process.env.LIVE_PAPI_AUTHORITY_JWT_ISSUER ?? EXPECTED_ISSUER;
  const audience = process.env.LIVE_PAPI_AUTHORITY_JWT_AUDIENCE ?? EXPECTED_AUDIENCE;

  if (!token || !baseUrl) {
    t.skip(
      'LIVE_PAPI_AUTHORITY_TOKEN / LIVE_PAPI_AUTHORITY_BASE_URL not set — skipping the live round-trip; hand-crafted-keypair tests above still prove the verification logic.',
    );
    return;
  }

  const verifier = makeVerifier(baseUrl, { issuer, audience });
  const claims = await verifier.verifyAccessToken(token);

  assert.ok(isAccessTokenClaims(claims));
  assert.equal(claims.iss, issuer);
  assert.equal(claims.aud, audience);
  assert.equal(typeof claims.sub, 'string');
  assert.equal(typeof claims.panel, 'string');
  assert.equal(typeof claims.projects, 'object');
  assert.equal(typeof claims.platform, 'object');
});
