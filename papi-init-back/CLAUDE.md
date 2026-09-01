# papi-init-back — service conventions

The skeleton NestJS backend the platform's forked admin panels (rmp, cms, dmp, btms, mmp,
nh-admin) fork from. A **thin, stateless consumer of papi-authority** — not a standalone identity
service.

## Status: feature-complete for v1 (Phase 7, 2026-08-31); Phase 8 reverted 2026-08-31

Phase 8 (opt-in `admin-db`/`external-db` TypeORM wiring, Part P.10/P.11) was documented as shipped
but its actual module files never existed on disk — only the `app.module.ts` imports and
`env.schema.ts` fields referencing them, which broke `npm run typecheck`/`build`. **Removed**
(2026-08-31, on request): the `AdminDbModule`/`ExternalDbModule` imports in `app.module.ts`, the
`ADMIN_DB_*`/`EXTERNAL_DB_*` fields and `ExternalDbMode` import in `env.schema.ts`, and
`test/env-schema-db.test.js` (tested only those now-removed fields). Part P.5's "no DB in v1" is
back in effect, unamended — see dossier Part P.12. If this wiring is wanted again, it needs to be
actually built, not just re-declared.

## Status: feature-complete for v1 (Phase 7, 2026-08-31)

All seven phases of the tech plan are done. This skeleton now provides, and a fork can rely on all
of it existing and being hardened:

- **Auth proxy** — `POST /api/auth/{login,refresh,logout}`, `POST /api/sso/login` (Phase 3).
- **The JWKS verification boundary + permission guard** — every non-`@Public()` route is
  authenticated against papi-authority's own RS256 tokens and default-deny authorized against the
  token's baked `projects`/`platform` claims, with zero papi-authority calls on the hot path
  (Phases 2/4).
- **Self-service proxy** — `GET/PATCH /api/users/me`, `POST /api/users/me/password`,
  `GET /api/users/me/projects`, `GET /api/auth/session` (Phase 5).
- **Read-only user-listing proxy** — `GET /api/users` (added 2026-08-31, post-v1, Archon+user
  approved). Deliberately list-only: it proxies ONLY papi-authority's `UsersController.list`, never
  the rest of that controller's surface (create/update/delete/access/password/unauthorize), which
  stays access-control's per papi-authority's own comment on that controller. Gated with
  `@PlatformPermissions(['users', 'view'])`, not `@SkipPermissions()` — unlike `/users/me`, this is
  not a self-resource.
- **Six generic, opt-in infrastructure modules** — storage, image-processing, the outbound HTTP
  client, ClickHouse, export, and the always-on external-system API-key guard (Phase 6).
- **A hardened boot baseline** — Helmet, CORS allow-list, two throttle buckets, body-size limit,
  drain-window shutdown, the RFC-9457 exception filter, and the pagination convention (Phase 1),
  re-swept end-to-end in Phase 7 with zero regressions found and one real (narrow) logging leak
  found and fixed — see "Phase 7 hardening sweep" below.

**What does NOT exist here, and never will in this skeleton** — this is deliberate, per module
inventory Part R.4: any business-domain module (bets, providers, campaigns, whatever a real panel
actually manages). Building one is a forked panel's job, not this skeleton's. If a task looks like
it wants to add domain logic, a domain DTO, or — the loudest signal — a `users`/`roles`/anything-
identity table here, that task belongs in a fork or in papi-authority, not in `papi-init-back`.

> **Read before changing anything:** `../.claude/papi-init-back-plan.md` (Part P — every locked
> decision specific to this service), `../.claude/papi-init-back-tech-plan.md` (the phased plan),
> `../.claude/papi-init-back-module-inventory.md` (Part R — what carries over from the old
> platform and what doesn't, Part S — the pagination/error-handling design). Shared platform
> knowledge (token shape, the 4-layer permission model) lives in `../.claude/papi-authority-plan.md`
> Parts D/G/I/J/K. Decisions are referenced below as "Part P.x" / "dossier 0.x".

## No local identity — ever, in v1

**This service has no `users`, `roles`, `refresh_tokens`, or any identity table, and never will in
v1** (Part P.4/P.5). Every identity fact — who the caller is, which projects they can act on, what
they can do on each one — comes from papi-authority, either by:

1. **Proxying** to papi-authority (`/api/auth/*`, `/api/sso/*`, `/api/users/me*`,
   `/api/users` (list), `/api/app-init`) — this service adds its own `PANEL_KEY` and the caller's
   real IP, and returns papi-authority's response/error unchanged.
2. **Verifying the RS256 access token locally** against papi-authority's cached JWKS (Phase 2) and
   reading project/permission scope straight off the token's baked `projects` claim — **zero
   papi-authority calls on the hot path** (Part P.4c/d).

If a task looks like it needs a local `users`/`projects` table, that is a signal the task belongs
in papi-authority or in a forked panel, not here. Flag it and stop.

## Vocabulary

**papi-authority** (the identity/auth authority this service consumes) · **papi-init-back** (this
service — the fork base) · **admin panels** (rmp, cms, dmp, btms, mmp, nh-admin — the real panels
that fork this skeleton).

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | watch mode |
| `npm run build` | `nest build` (prebuild wipes `dist`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm test` | builds, then runs Node's built-in test runner against `dist/` |

Local setup: `cp .env.example .env` → fill in `PANEL_KEY`/`PAPI_AUTHORITY_BASE_URL` → have a
running, seeded `papi-authority` instance with a matching `admin_panels.panel_key` row (boot it per
`papi-authority`'s own CLAUDE.md — Part P.7's cross-repo dev-bootstrap dependency) → `npm run
start:dev`.

## Conventions

- **Path alias `$/` → `src/`.** Declared via `paths` **without `baseUrl`** — `baseUrl` is
  deprecated in TS 6 and removed in TS 7, and it would also let bare `src/...` imports resolve,
  silently bypassing the convention. `$/` is rewritten by the Nest CLI at emit, not by `tsc` — any
  non-Nest entrypoint (a future test script, a CLI script) must run against compiled `dist/`
  output, same as papi-authority's `migration:*`/`seed` scripts.
- **`module: node20` / `moduleResolution: node16`.** `node20` models a Node that can `require()` an
  ESM-only package; `node16` does not, and TS 6 enforces that the resolution *algorithm* pairs with
  `node16` regardless (`TS5109`).
- **`target`/`lib`: `ES2024`**, matching the `engines.node >= 24.11.0` floor.
- **`useDefineForClassFields: false` — pinned, do not delete, do not "let it default."** At
  `target: ES2022`+ this defaults to `true`, giving class fields ECMAScript `define` semantics:
  every declared-but-unassigned field becomes an own property set to `undefined` at construction.
  Verified consequence (papi-authority dossier 0.60, same TS/Node pairing here): a PATCH DTO
  `class UpdateXDto { name?: string; email?: string }` fed only `{ name }` yields own keys
  `["name","email"]` under the default, so `Object.assign(target, dto)` **wipes the untouched
  `email` field**. With `false` the same DTO yields `["name"]` and the field survives. No entity
  exists here yet to demonstrate it against, but any forked panel's first PATCH endpoint will hit
  this immediately if the setting regresses.
- **`incremental` stays off.** With nest-cli's `deleteOutDir`, a stale `.tsbuildinfo` produces a
  silently partial build.
- **Never read `process.env` outside `src/configs/**`.** Enforced mechanically by an ESLint
  `no-restricted-properties` rule, not merely documented. Inject `ConfigService`, or the typed
  `ConfigType<typeof xConfig>`.
- **Config is typed.** Every namespace uses `registerAs`; consumers inject
  `ConfigType<typeof xConfig>` — no `configService.get<T>()` casts.
- **Config validation is class-validator** against `EnvironmentVariables` in
  `src/configs/env.schema.ts`. Add a variable there, to `.env.example`, and to the relevant
  `*.config.ts` factory.
- **Routes are `/api/<domain>/...`** via `setGlobalPrefix('api')`. No URI versioning. `/live` and
  `/ready` are excluded from the prefix for infra probes.
- **Module layout per domain:** `<domain>.module.ts` + `controllers/` + `services/` + `dto/`.
  Mount domain modules in `src/api/api.module.ts` — we do not use old papi-back's `RouterModule`
  triple-listing, where omitting a module from one of three lists silently drops its prefix.

## The exception-filter coding rule (dossier 0.63, module inventory Part S.2)

`src/core/errors/all-exceptions.filter.ts` passes through the message of any `HttpException` with a
**4xx** status, and collapses **everything else** (any non-`HttpException` throw, and any 5xx,
however constructed) to one generic message per status family, logging the real detail server-side
keyed by the request id.

The filter cannot mechanically tell a deliberately-authored client-facing message apart from a
hand-constructed one that leaked internal state — both are, at runtime, just an `HttpException`
carrying a string. **The actual control is a coding rule, not the filter:**

> **Never construct an exception's message from a caught error's own `.message` or response
> body.** Always write a static string, and log the original error separately (the filter already
> does this for anything that collapses — but a 4xx you construct from caught text passes straight
> through, uninspected).

```ts
// WRONG — forwards whatever papi-authority (or any upstream) said, verbatim.
catch (err) {
  throw new BadRequestException(err.message);
}

// RIGHT — a static, developer-authored message. Log the real error separately if useful.
catch (err) {
  this.logger.error(`login proxy failed: ${err instanceof Error ? err.message : String(err)}`);
  throw new BadRequestException('Could not process the request.');
}
```

This applies everywhere this service calls out to papi-authority (the app-init proxy today; the
auth/SSO/users proxies from Phase 3 onward) — never forward an upstream error body into a locally
thrown exception without writing your own message first.

## The pagination rule (module inventory Part S.1)

`src/core/http/pagination.dto.ts` — `page`, `limit` (capped at 200 via `@Max(200)`), `search`
(free-text), `order` (`'ASC'|'DESC'` **direction only**) — is copied verbatim from papi-authority's
already-correct convention. It ships in Phase 1 even though no endpoint here paginates yet, so
every future fork inherits the safe convention instead of reinventing pagination per panel.

**A paginated endpoint hardcodes its own sortable column(s) and its own searchable column(s) in the
service.** `order`/`search` from the client select *behavior*, never *which column*:

```ts
// RIGHT — column is hardcoded; client only controls direction and the search term.
builder.orderBy('panel.name', query.order ?? 'ASC');
if (query.search) builder.andWhere('panel.name LIKE :search', { search: `%${query.search}%` });

// WRONG — old papi-back's pattern: client-controlled column, no allowlist.
builder.orderBy(query.sortField, query.order); // lets a caller sort/select ANY column, e.g. `password`
```

Any future fork's list endpoint that wants a client-selectable sort column must run it through an
explicit `enum`/allowlist DTO field — never a free-text field forwarded into `order`/`select`.

## The env contract

| Variable | Purpose |
|---|---|
| `PANEL_KEY` | This fork's identity in papi-authority — must match a seeded `admin_panels.panel_key` row there (Part P.7). |
| `PAPI_AUTHORITY_BASE_URL` | Base URL of the papi-authority instance this service consumes. Also where the JWKS boundary (below) fetches `/.well-known/jwks.json` from. |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Expected `iss`/`aud` on every access token verified locally (Phase 2). Must match the ACTUAL papi-authority instance's own `JWT_ISSUER`/`JWT_AUDIENCE` — these are per-deployment values, not fixed platform constants; the `.env.example` defaults are only papi-authority's own local-dev defaults. |
| `NODE_ENV`, `PORT`, `APP_NAME`, `TRUSTED_PROXY_HOPS`, `CORS_ORIGINS`, `READINESS_DRAIN_MS`, `BODY_LIMIT` | Same core hardening knobs as papi-authority. |
| `THROTTLE_DEFAULT_*`, `THROTTLE_AUTH_*` | Two named buckets — `default` is global, `auth` opts in per-route via `@AuthThrottle()` (used from Phase 3). |
| `STORAGE_ENABLED`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`, `STORAGE_MAX_FILE_SIZE_BYTES` | Gates `src/services/storage/` (Phase 6). The connection string/container name are only required (and only read) when `STORAGE_ENABLED=true`. |
| `IMAGE_PROCESSING_ENABLED` | Gates `src/services/image-processing/` (Phase 6). No other config — `sharp` needs no credentials. |
| `CLICKHOUSE_ENABLED`, `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE` | Gates `src/services/clickhouse/` (Phase 6). The four connection fields are only required when `CLICKHOUSE_ENABLED=true`. |
| `EXPORT_ENABLED` | Gates `src/services/export/` (Phase 6). No other config. |
| `EXTERNAL_SYSTEM_AUTH_API_KEY` | Always required — NOT gated by an `_ENABLED` flag. Static key for `ExternalSystemAuthGuard` (Phase 6); at least 16 characters, generate a real random value per deployment. |
| `GRPC_SERVICES` | Config for `src/connections/grpc/` (Phase 9). NOT gated by a `GRPC_ENABLED` flag — a JSON array of `{enabled, host, protoPath, packageName, service}` objects, default `[]` (nothing configured, nothing can be registered). Validated as well-formed JSON of the correct per-entry shape at boot regardless of whether anything ends up requesting a service. |

Not yet implemented: a `MAIL_ENABLED` mailer module was scoped out of Phase 6 (module inventory Part
R.3 recommends it as a future addition, via Azure Communication Services, never Mailgun — see the
gRPC/mail convention note near the end of this file). There is no `MAIL_ENABLED` variable yet.

## The JWKS verification boundary (Phase 2)

This is the ONLY place in the service that turns a bearer token into a trusted identity. Every
other guard, controller and service downstream must treat its output as already-verified — never
re-verify, never call papi-authority to double-check.

- **`src/core/jwks/jwks-verifier.service.ts`** (`JwksVerifierService`) — fetches and caches
  papi-authority's `GET <PAPI_AUTHORITY_BASE_URL>/.well-known/jwks.json` via `jwks-rsa` (the same
  library papi-authority itself uses to verify inbound Azure tokens — a proven-safe dependency
  choice on this platform, CommonJS, no ESM trap). Exposes
  `verifyAccessToken(token: string): Promise<AccessTokenClaims>`. The algorithm is pinned to
  `algorithms: ['RS256']` from this service's OWN policy, never read from the token header — an
  `alg: none` or RS256→HS256 key-confusion forgery is structurally impossible to accept here, not
  merely unlikely. `iss`/`aud` are checked against `JWT_ISSUER`/`JWT_AUDIENCE` (above). Every
  failure mode — bad signature, wrong `alg`, expired `exp`, wrong `iss`/`aud`, unknown `kid`, or a
  payload that verifies but doesn't carry `AccessTokenClaims`'s shape — throws the SAME
  `TokenVerificationError`; the type deliberately carries no information a caller should branch on.
- **`src/guards/jwt.guard.ts`** (`JwtGuard`) — registered globally as `APP_GUARD` in
  `app.module.ts`, immediately after `ThrottlerGuard` (guard order: throttle → authenticate →
  authorize). Reads `Authorization: Bearer <token>`, calls `JwksVerifierService`, and on success
  attaches the verified claims to **`request.tokenClaims`** (same field name papi-authority's own
  `JwtGuard` uses on `AuthenticatedRequest` — kept identical across both services on purpose).
  **Any** failure — missing header, malformed header, or anything `JwksVerifierService` throws —
  collapses to a bare `UnauthorizedException()` with no message. This is deliberate: which check
  failed is information useful only to an attacker probing the verifier, never to a legitimate
  caller. `@Public()` (already shipped in Phase 1) exempts a route from this guard entirely.
- **`request.tokenClaims` is the trusted source of identity from here on.** Phase 4's
  `PermissionGuard` reads `tokenClaims.projects`/`tokenClaims.platform` directly — it never
  re-verifies the token and never calls papi-authority. If a future task looks like it needs to
  re-check a token's validity mid-request, that is a sign it belongs before `JwtGuard` in the
  pipeline, not after it.
- **Registering `JwtGuard` globally makes authentication default-ON.** Every route not marked
  `@Public()` becomes unreachable without a valid bearer token — this is why `/live`, `/ready` and
  `GET /api/app-init` (Phase 1) already carry `@Public()`; any future route that forgets it fails
  loudly (401 on every call) rather than silently serving unauthenticated traffic.

`src/constants/interfaces/token-claims.interface.ts` defines `AccessTokenClaims` /
`ProjectPermissionSet` — copied field-for-field from papi-authority's own
`token-claims.interface.ts`, since this is the wire contract between the two services, not a type
either side is free to redesign independently. It also exports `isAccessTokenClaims`, a runtime
type guard: a valid signature says nothing about the payload actually carrying the claims this
service depends on, so the shape is checked before anything downstream trusts a field off it.

## The permission guard (Phase 4)

Phase 2 established `request.tokenClaims` as the trusted source of identity. Phase 4 is what
actually USES that trust to gate requests — `src/guards/permission.guard.ts` (`PermissionGuard`),
registered globally as the third `APP_GUARD`, immediately after `JwtGuard` (guard order: throttle
→ authenticate → authorize, unchanged from Phase 2). It reads **only** `request.tokenClaims` —
never re-verifies the token, never calls papi-authority. Every permission set it checks was already
resolved once, at token-issuance time, inside papi-authority's own 4-layer model (dossier Part
F.5); this guard's whole job is comparing a route's declared requirement against what is already
baked into the token.

Three decorators, in `src/decorators/public.decorator.ts` (same file as `@Public`/`@AuthThrottle`,
same metadata-key naming convention as papi-authority — `papi:permissions`,
`papi:platformPermissions`, `papi:skipPermissions` — kept identical across both services on
purpose):

- **`@RequirePermissions(...permissions: PermissionTuple[])`** — project-scoped. Requires an
  `x-project-id` header; checks `tokenClaims.projects[x-project-id].apis`. 403 if the header is
  missing, if the id isn't a key in the `projects` map, or if any required `[section, key]` isn't
  in that project's `.apis` array.
- **`@PlatformPermissions(...permissions: PermissionTuple[])`** — platform-scoped, for any
  panel-scoped-but-not-project route a fork adds later (mirrors papi-authority's own dossier-0.43
  pattern). No `x-project-id` needed; checks `tokenClaims.platform.apis` directly.
- **`@SkipPermissions()`** — exempts an authenticated route from the permission check entirely.
  Not yet exercised by any route as of Phase 4; Phase 5's `/api/users/me` proxy is the first user
  (a self-resource — nothing to authorize beyond "you are signed in").

**Default-deny.** A non-public, non-`@SkipPermissions()` route with neither `@RequirePermissions`
nor `@PlatformPermissions` declared is refused with a 403 — undeclared means forbidden, not
allowed. This is deliberately not rmp's old allow-by-default posture, where any authenticated
project member passed an undecorated route.

**A route may declare both.** If so, the platform check runs first; both must pass. Declaring only
one is also valid (e.g. a route that is platform-only, or project-only).

**Checks are against `.apis` only, never `.pages`.** `.apis` is the backend-enforcement array;
`.pages` is frontend menu/route visibility, exposed later via `GET /api/auth/session` (Phase 5) for
the UI to decide what to render — a backend guard has no business reading it. A permission present
only in `.pages` and not `.apis` does not pass this guard.

## Generic infrastructure modules (Phase 6)

Six modules from `papi-init-back-module-inventory.md` Part R.3, each shipping the specific security
fix Part R.5 found in the old platform's version — never the old implementation ported verbatim.
Five are opt-in and env-gated (`<NS>_ENABLED`); the sixth (`HttpClientService`, the service-to-system
guard) is always-on infrastructure. **The gating mechanism matters as much as the fix itself:** for
the two modules with a real external client (storage, ClickHouse), the flag gates a `useFactory`
provider that only calls the real SDK constructor when enabled — a disabled module never even
attempts to build a `BlobServiceClient`/ClickHouse client, proven directly in
`storage-client-factory.test.js`/`clickhouse-client-factory.test.js` without any Nest bootstrap
(pass a deliberately malformed connection string/URL to the disabled path and confirm it returns
`null` without throwing — the SAME malformed value is proven to throw when the real constructor
function is actually called). For image-processing/export, there is no external client to gate the
construction of — the flag is checked as the first line inside every method instead.

- **`src/services/storage/`** (`storage.service.ts`, `STORAGE_ENABLED`) — Azure Blob
  upload/delete/exists via `@azure/storage-blob`, replacing old papi-back's
  `azure-storage.service.ts`. Two defects fixed (Part R.5):
  - **Old:** `uploadBlobs(name, ...)` took a caller-supplied `name` used directly as the blob path —
    Azure blob names allow `/`, so this was a path-write primitive. **Here:** `upload()` has no
    parameter that accepts a key at all; the key is always `crypto.randomUUID()`, generated inside
    the service and returned to the caller. There is no code path by which a caller can influence
    it (`storage-service.test.js` proves two uploads of identical bytes yield different keys).
  - **Old:** the caller-declared `contentType` was trusted outright, never checked against the
    actual bytes. **Here:** `file-signature.ts` sniffs the real file type from its magic bytes
    (PNG/JPEG/WebP/PDF signatures — a small, explicit set, not an attempt to detect everything) and
    `upload()` rejects (`StorageValidationError`) on any mismatch with the declared type.
  - A max size (`STORAGE_MAX_FILE_SIZE_BYTES`) is enforced by `bounded-buffer.ts` BEFORE the
    container client is ever touched: a declared `Content-Length` above the cap is rejected without
    reading a single byte, and a stream with no/understated `Content-Length` is bounded by a running
    byte-counter that destroys the source the instant the cap is crossed.
  - `delete(key)`/`exists(key)` reject any `key` that isn't UUID-shaped (`StorageInvalidKeyError`)
    before it reaches the container client (code review, 2026-08-30) — a cheap, mechanical check,
    **not an ownership check**. A syntactically valid UUID belonging to a different caller's upload
    still passes it: this module has no user/session model to check ownership against. Whichever
    controller eventually calls `delete`/`exists` is responsible for verifying the caller may act on
    that specific key (e.g. by keeping its own record of which key belongs to which owner) — don't
    assume this service enforces that for you.
- **`src/services/image-processing/`** (`image-processing.service.ts`, `IMAGE_PROCESSING_ENABLED`)
  — resize/WebP-convert via `sharp`, replacing old papi-back's `sharp.service.ts`. **Old:**
  `SharpService.toBuffer(image: Buffer | string)` did `axios.get(image)` on any string — an SSRF
  hole, fetching an arbitrary caller-supplied URL with no allowlist. **Here:** `transform()` accepts
  ONLY a `Buffer` — there is no URL-input mode at all, not merely an unused one. Enforced both by the
  TypeScript signature (a compile error for a TS caller) and by a runtime `Buffer.isBuffer` guard
  (for a JS caller or an `as any` cast) that throws a `TypeError` before `sharp` is ever invoked.
  `sharp.cache(false)` is set in the constructor — the old code's one genuinely correct line,
  avoiding the on-disk cache — carried forward unchanged.
- **`src/core/http-client/`** (`http-client.service.ts`, always on) — a generic `get`/`post`/`put`/
  `delete` wrapper, timeout-bounded via `AbortController`, JSON in/out. Formalizes the fetch pattern
  `papi-authority-caller.ts` already used ad hoc (Phases 1/3/5) as something any future fork can
  inject for its OWN outbound calls — deliberately NOT a refactor of `papi-authority-caller.ts`
  itself, which encodes a two-class error contract specific to papi-authority's own unfiltered-error
  quirk (dossier 0.63); the two coexist. **Old:** `HttpRequestService`'s error handler logged the
  full request `data` object on every failed call — a failed login proxy built on that pattern would
  log a plaintext password. **Here:** `HttpClientService` never logs request or response BODY
  content, for any call, ever — only method, a query-string-and-userinfo-stripped path, status, and
  the error message (`http-client-service.test.js` proves a secret placed in either the request or
  response body never appears in a captured `Logger.error` call). **Old:** every failure collapsed
  to a generic `BadRequestException()`, discarding the real status. **Here:** `HttpClientError.status`
  carries the REAL upstream status code (or `undefined` for a failure that never got a response at
  all) — the caller decides what a 401 vs. a 500 means, this client doesn't decide for it.
- **`src/services/clickhouse/`** (`clickhouse.service.ts`, `CLICKHOUSE_ENABLED`) — a minimal,
  deliberately non-fluent wrapper around `@clickhouse/client`, replacing old papi-back's
  `ClickHouseService`. **Old:** `buildWhereSql`/`buildHavingSql` string-interpolated client-controlled
  filter values directly into query text (`` `${key} = '${value}'` ``, array values joined unescaped
  into `IN (...)`, even `` `id = ${betId}` `` with no quoting) — textbook SQL injection against the
  analytics database. **Here:** `query(sql, params)` NEVER builds a WHERE/HAVING clause and never
  string-interpolates a value — every value that varies per call MUST be referenced in `sql` via the
  library's own `{name:Type}` placeholder syntax and supplied through `params`, forwarded verbatim to
  `query_params` (`clickhouse-service.test.js` feeds a hand-crafted `x' OR '1'='1'`-style value
  through a mocked client and asserts it arrives ONLY as a bound `query_params` entry, never inside
  the query string). There is deliberately no fluent query-builder with dynamic column/table names —
  a future panel needing dynamic filtering builds the parameterized query text itself and calls this
  wrapper, following the same rule.
- **`src/services/export/`** (`export.service.ts`, `EXPORT_ENABLED`) — CSV via `fast-csv` and Excel
  via `exceljs` (never the npm `xlsx` package — unpatched prototype-pollution/ReDoS advisories,
  already banned platform-wide, dossier D.3b/module inventory Part R.5). Old papi-back's
  `CsvService` was otherwise fine on its own; the one defect (Part R.5) is fixed here: **every**
  exported cell is run through `formula-neutralizer.ts`'s `neutralizeRow()` before being written — a
  value starting with `=`, `+`, `-`, or `@` gets a leading apostrophe prefixed, so it cannot execute
  as a formula when the file is opened in Excel/Sheets (the same fix papi-authority's own audit CSV
  export already applies, dossier 0.55; `export-service.test.js` asserts on the actual written CSV
  bytes, not just the pure neutralization function). **`package.json` pins an `overrides.uuid`
  entry** — `exceljs` depends on `uuid@^8`, which resolves to a version with a known moderate
  advisory (`GHSA-w5hq-g745-h8pq`); the override forces `uuid@^11.1.1` (patched) without waiting on
  `exceljs` to bump its own declared range. Do not remove this override without re-running `npm
  audit` to confirm it's still needed.
- **`src/guards/external-system-auth.guard.ts`** (`ExternalSystemAuthGuard`) + `src/api/external-system/`
  (always on, NOT gated by an `_ENABLED` flag — see `EXTERNAL_SYSTEM_AUTH_API_KEY` in the env
  contract) — a service-to-service API-key guard, replacing old papi-back's
  `external-system-auth.guard.ts`. Reads the `apikey` header (same convention as the old guard).
  **Old:** compared with plain `apiKey !== validApiKey` — a timing side-channel letting an attacker
  recover the key byte-by-byte via response-latency measurement. **Here:** compares with
  `crypto.timingSafeEqual` on fixed-length buffers; a length mismatch is rejected FIRST (required
  for correctness — `timingSafeEqual` itself throws on mismatched-length buffers — and this check
  leaks only whether the length matches, never anything about the secret's content).
  `external-system-auth-guard.test.js` proves both branches by intercepting the real
  `crypto.timingSafeEqual` (not by checking `===`/`!==` is absent from the source): it IS called for
  every same-length comparison (right or wrong key) and is NEVER called when the length already
  mismatches. `src/api/external-system/controllers/external-system.controller.ts` ships one trivial
  `GET /api/external-system/ping` route demonstrating the guard — no real business logic exists yet;
  a future fork adds its own internal-caller routes behind the same guard.

## Admin DB + external DB wiring — documented as Phase 8, never actually built; removed 2026-08-31

This section previously described two opt-in TypeORM modules (`src/connections/admin-db/`,
`src/connections/external-db/`, Part P.10/P.11) as shipped. **They never existed on disk** — only
`app.module.ts`'s imports of them and `env.schema.ts`'s `ADMIN_DB_*`/`EXTERNAL_DB_*` fields did,
which broke `npm run typecheck`/`build` outright. Removed rather than built, on request: the two
imports in `app.module.ts`, the env-schema fields and `ExternalDbMode` import, and
`test/env-schema-db.test.js` (tested only those fields). **Part P.5's "no DB in v1" is back in
effect** — see dossier Part P.12 for the full record. If this wiring is wanted, it needs to be
built for real — code, tests, and doc together — not re-declared in this file alone.

## Phase 7 hardening sweep (2026-08-31)

The final v1 phase — an audit pass, not new feature code. Re-verified by reading source, not by a
live boot.

**Logging audit.** Every `logger.error`/`.warn`/`.log`/`.debug`/`console.*` call site in `src/`
was read and checked against: never a request/response body, never a raw `Authorization`
header/bearer/refresh token/API key, never a raw password, never a URL that could carry a secret
in its query string or userinfo segment. Twelve call sites exist; eleven were already safe
(method/path/status/a developer-authored-or-network-level message only — `app-init.service.ts`,
`auth.service.ts`, `sso.service.ts`, `me.service.ts`, `papi-authority-caller.ts`'s
`throwForProxyError`, `http-client.service.ts`'s `logFailure`, `main.ts`'s two lifecycle lines).
`src/guards/`, `src/services/storage/`, `src/services/image-processing/`,
`src/services/clickhouse/`, `src/services/export/`, and `src/core/jwks/` log nothing at all —
confirmed by grep, not assumed.

**One real finding, fixed:** `AllExceptionsFilter.logCollapsed()` (`src/core/errors/all-exceptions.filter.ts`)
logged any collapsed exception's `.message`/`.stack` verbatim (after key-based `redact()`, which
only scrubs object keys, not free-text content). A malformed-JSON request body — e.g. a
login/password-change payload a caller failed to JSON-encode correctly — surfaces as a bare
`SyntaxError` thrown by `express.json()`'s body-parser straight from `JSON.parse`, uncaught before
this filter's `resolve()` ever sees an `HttpException`. V8's own `JSON.parse` `SyntaxError`
messages (and `.stack`, whose first line repeats the message) can echo back a raw snippet of the
exact text that failed to parse — that snippet is the caller's own raw request body, verified
directly: `JSON.parse('hunter2longenoughtobeechoed is not json')` throws
`Unexpected token 'h', "hunter2lon"... is not valid JSON`. That is exactly the “never log a
request body” rule broken by construction of the JS runtime, not by anything this codebase wrote.
**Fixed:** `AllExceptionsFilter` now special-cases `SyntaxError` in `describeForLog()` and logs a
static placeholder for it instead of the real message/stack; every other `Error` subtype (network
failures, developer-authored messages) is unaffected and still logs in full for real diagnosis.
Regression test added: `test/all-exceptions-filter.test.js` — "a body-parser-style SyntaxError
never echoes a raw body snippet into the server log."

**A second, more serious instance of the same root cause was found afterward — in the HTTP
RESPONSE itself, not just the log — by a live capstone check** (Archon, 2026-08-31, after the
audit above; this is exactly why "confirmed by reading source" and "confirmed live" are not
interchangeable). Sending a malformed JSON body to a running instance (`curl -d 'not json' ...`)
returned `{"detail":"Unexpected token 'h', \"hunter2lon\"... is not valid JSON", ...}` — the raw
body snippet, in the CLIENT-VISIBLE response, despite the logging fix above. Root cause, confirmed
by instrumenting a running instance rather than guessing: NestJS's own HTTP adapter wraps
`json()`'s raw `SyntaxError` into a real `BadRequestException` **before** `AllExceptionsFilter`
ever runs, and does **not** preserve the original `SyntaxError` as `.cause` (verified:
`exception.cause` was `undefined` inside the filter). The filter's own "trusted 4xx" rule then
forwards the wrapped exception's message unchanged — correct behavior for a message the filter
receives, but the message here was never deliberately authored; Nest's wrapping had already
discarded the one signal (`instanceof SyntaxError`) that would have let the filter tell the
difference. **Fixed at the only point where that signal still exists** — a new Express-level error
middleware, `src/core/http/body-parser-error-middleware.ts`, mounted immediately after
`json()`/`urlencoded()` in `main.ts`, before Nest's own request pipeline (and its wrapping) ever
sees the error. It detects the exact shape body-parser produces (`SyntaxError` with
`status === 400`, the `http-errors` library's shape) and replaces the message with a static string
while deliberately preserving `status`/`statusCode` — the client-visible outcome is unchanged
(still a 400, still the same code path) except the response body no longer contains request
content. Verified live, twice: before the fix (leak reproduced), and after (four cases —
malformed JSON now returns the static message; a well-formed-but-invalid body still returns real,
safe DTO validation errors unchanged; a genuinely valid body passes through to the real proxy
logic unaffected; the server log still shows no leak). Unit-tested in
`test/body-parser-error-middleware.test.js` (neutralizes the exact body-parser shape; passes
through any other error, including an application-thrown `SyntaxError` with no `.status`,
unchanged — narrowing this to exactly the one case that needs it, not `SyntaxError` in general).

**Hardening checklist — confirmed by reading `main.ts`/controllers, not by booting:**
- Helmet: CSP (`default-src 'self'`, no `unsafe-inline` anywhere), HSTS (1yr + subdomains +
  preload), `referrerPolicy: no-referrer` — unchanged since Phase 1.
- CORS: exact-origin allow-list, no-`Origin` (server-to-server) requests permitted,
  `callback(null, false)` for a rejected origin (never an `Error`, which would surface a
  misleading 500) — unchanged since Phase 1.
- Throttle buckets — every credential-verifying route carries `@AuthThrottle()`:
  `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`,
  `POST /api/sso/login`, `POST /api/users/me/password`. Every non-credential
  authenticated route uses only the global `default` bucket and was confirmed NOT to carry
  `@AuthThrottle()`: `GET/PATCH /api/users/me`, `GET /api/users/me/projects`,
  `GET /api/auth/session`. `GET /api/external-system/ping` carries neither `@SkipThrottle()` nor
  `@AuthThrottle()` — the global `default` bucket applies to it like any other route;
  `@SkipThrottle()` is used ONLY on `/live`/`/ready` (infra probes), confirmed by grep across the
  whole `src/` tree. **`GET /api/app-init` was moved OFF `@AuthThrottle()` onto the global
  `default` bucket** (code review, 2026-08-31 — see "Deliberate divergences" table below and
  papi-authority dossier 0.65 for the same fix on the equivalent route there): it is a read-only,
  unauthenticated config probe fired on every login-page load, not a credential-verification
  attempt, so it must not share the tight per-IP `auth` bucket (10 req/60s) with actual
  login/refresh/password-change traffic — a shared IP with >10 concurrent page loads would 429 on
  the endpoint that decides whether to even render a password field, a self-inflicted DoS on the
  login page itself. The Phase 7 sweep's original inclusion of `GET /api/app-init` in the
  `@AuthThrottle()` list above was itself the bug, not a correct finding.
- Body-size limit: `BODY_LIMIT` (`main.ts`'s `json()`/`urlencoded()`) unchanged since Phase 1,
  default `100kb`. Phase 6's storage module has no HTTP upload controller yet (only the service
  class) — nothing to test here until a real controller exists; noted, not treated as a gap.
- Every Phase 6 opt-in module's disabled path re-confirmed by re-reading the actual code (not just
  re-running Phase 6's own tests, though those were also re-run, 21/21 green): `storage`/
  `clickhouse`'s `resolve*Client()` factories never call the real SDK constructor when disabled;
  `image-processing`/`export` check `config.enabled` as the first line of every public method,
  before any other logic runs; each throws its own dedicated `XDisabledError` subclass and nothing
  else — no other code path reveals disabled-vs-misconfigured.

**Env contract audit:** every variable in `src/configs/env.schema.ts`'s `EnvironmentVariables`
(27 total) cross-checked against both this file's env table and `.env.example` — all 27 present
in both; no gaps found.

## Deliberate divergences from old papi-back — fixed here, don't reintroduce

Restated from papi-authority's own dossier D.3b defect list — this service inherits the same
platform-wide fixes:

| Here | Old papi-back | Why |
|---|---|---|
| `trust proxy` configured (`TRUSTED_PROXY_HOPS`) | absent, trusts `x-forwarded-for` blindly | otherwise throttle keys and any audit-style IP are client-spoofable |
| one owner for `/live` + `/ready`, real 503, no diagnostic detail | two owners; 200-with-503-in-body; leaks error text | probes must be actionable and must not disclose |
| drain window before `app.close()`, with a timeout guard | closes immediately | otherwise draining never happens — `/ready` never actually flips before the socket closes |
| `setGlobalPrefix('api')` | `RouterModule` triple-listing | removes a silent prefix-loss failure mode |
| `no-explicit-any` on, type-aware ESLint rules | zero type-aware rules, `no-explicit-any` off | a floating promise in a guard is an auth bug |
| `process.env` ban enforced by lint | documented only, violated repeatedly | conventions without enforcement are not controls |
| `rootDir` + `include` set | neither | emits `dist/src/main.js`, breaking `start:prod` |
| `xlsx` package never used — `exceljs` instead (Phase 6 `src/services/export/`) | ships `xlsx` with unpatched advisories | dependency hygiene (Part R.5) |
| RFC-9457 filter actually registered globally | 4xx bodies passed through unsanitized (`throw new BadRequestException(data.message)` forwarding upstream text verbatim) | see the coding rule above |
| Collapsed-exception server-side logging suppresses `SyntaxError` message/stack (Phase 7 audit finding, 2026-08-31 — see "Phase 7 hardening sweep" above) | n/a — old papi-back never had a global exception filter at all, so this specific leak shape didn't exist there | V8's own `JSON.parse` `SyntaxError` messages can echo a raw snippet of a malformed request body; logging it verbatim server-side would violate "never log a request body" even though the leak's source is the JS runtime, not application code |
| pagination `limit` capped at 200, sort column server-hardcoded | uncapped `limit`, client-controlled `sort`/`select`/`filter` reaching raw TypeORM `where`/`select` | see the pagination rule above |

Also restated from module inventory Part R.5, now shipped in Phase 6 (see "Generic infrastructure
modules" above for the full detail per module): ClickHouse queries must use `@clickhouse/client`'s
parameterized `query_params`, never string-built WHERE/HAVING; image processing accepts only an
in-memory buffer, never fetches an arbitrary caller-supplied URL; storage keys are always
server-generated (UUID), never a caller-supplied path, and the declared content-type is verified
against the file's actual magic bytes; the outbound HTTP client never logs request/response bodies;
the service-to-service auth guard compares with `crypto.timingSafeEqual`, never `!==`; CSV/Excel
export neutralizes spreadsheet-formula-triggering cell values; Excel export uses `exceljs`, never
the banned `xlsx` package.

## gRPC client wiring (convention only — no client ships)

If a forked panel needs a gRPC client to one of its own microservices, wire it with
`ClientsModule.registerAsync`, following old papi-back's `grpc/index.ts` shape (proto path +
package name from config, package injected by name). No generated client ships in the skeleton
itself — every fork's proto/services are panel-specific (module inventory Part R.3). Mail, if a
panel needs it beyond auth, should go through Azure Communication Services to match papi-authority
rather than reintroducing the old platform's Mailgun dependency.

## Before finishing any task

1. `npm run build` — clean.
2. `npm run typecheck` — clean.
3. `npm run lint` — clean at `--max-warnings 0`.
4. Touched config? Update `.env.example` and confirm an invalid value still fails fast.
5. **Never `git commit` unless explicitly asked.**
