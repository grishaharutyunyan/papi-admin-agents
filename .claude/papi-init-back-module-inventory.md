# papi-init-back — Old Platform Module Inventory & Carry-Forward Decision

> **Purpose:** full read of `old-papi/{papi-backend-main, rmp-backend-main, cms-backend-main,
> dmp-backend-main}` (Part P.2's reference set), classifying every module as **skeleton**
> (goes into papi-init-back), **removed** (now papi-authority's job), **generic — bring as an
> opt-in service**, or **panel-specific business domain** (never belongs in the skeleton).
> Companion to `papi-init-back-plan.md` (architecture decisions) and
> `papi-init-back-tech-plan.md` (phases — Phase 6 executes Part R.3 below).

---

## PART R — LOCKED FINDINGS 2026-08-30

### R.1 — Identity/auth/SSO/users: REMOVED, already decided (Part P.4)

`auth/`, `sso/`, `users/` (the local `users`/`user-roles`/`refresh-token` stack), and
`external-tokens`-style verifiers exist in **all four** old backends, byte-similar. None of it is
carried forward — papi-authority owns identity now. papi-init-back keeps only the **thin proxy**
surface already specified in `papi-init-back-tech-plan.md` Phases 3 and 5 (`/auth/*`, `/sso/*`,
`/users/me`, `/users/me/projects`, `/app-init`). Not repeated here.

### R.2 — Skeleton wiring: confirmed present in ALL FOUR, carried forward as convention

Identical (or near-identical) across `papi-back`/`rmp-back`/`cms-back`/`dmp-back`, confirming
these are genuinely skeleton-level, not panel-specific: `common/pagination`, `common/helpers`,
`core/orm` (base CRUD + `pagination()`), `decorators/{public,roles,without-project}`,
`guards/{jwt,permission}`, `interceptors/{logging,pagination}`, `middlewares/{basicAuth,ssoAuth,
metrics}`, `metrics/` (Prometheus — **rebuild non-public**, dossier D.3b), `constants/interfaces`.
Already accounted for in Phases 1–4 of the tech plan (config, hardening, JWKS guard, permission
guard) or superseded by papi-authority equivalents. `validators/is-not-only-white-space` is a
trivial one-off — port if a DTO needs it, not as a standing module.

### R.3 — Generic cross-panel infrastructure: RECOMMENDED for papi-init-back as opt-in modules

Each ships **env-gated** (`<NS>_ENABLED`, the "genuinely worth carrying forward" pattern from
dossier D.3b) so a panel that doesn't need one pays nothing for it. **Every one of these needed a
security fix before it's fit to re-implement — see R.5; do not port any of them as-is.**

| Service | Found in | What it does | New home | Gate |
|---|---|---|---|---|
| **File/image storage** (`azure-storage`) | papi-back, cms, dmp (not rmp) | Upload/delete/exists against Azure Blob Storage | `src/services/storage/` | `STORAGE_ENABLED` |
| **Image processing** (`sharp`) | cms only | Resize / WebP-convert an image buffer | `src/services/image-processing/` | `IMAGE_PROCESSING_ENABLED` |
| **Outbound HTTP client** (`http-request`) | **all 4**, byte-identical | Wrapped `HttpService` (get/post/put/delete) with uniform error handling | `src/core/http-client/` | always on — also the pattern papi-init-back's own auth-proxy (Phase 3) should follow, re-implemented with the fix in R.5 |
| **ClickHouse client** (`gateways/clickhouse`) | **all 4**, byte-identical base client | Analytics/bet-statistics queries | `src/services/clickhouse/` | `CLICKHOUSE_ENABLED` |
| **CSV/Excel export** (`services/csv`, `services/excel`) | rmp, dmp | Stream a dataset to the client as `.csv`/`.xlsx` | `src/services/export/` | `EXPORT_ENABLED` |
| **Service-to-service auth** (`external-system` + its guard) | **all 4**, byte-identical | A static-API-key-gated surface for internal callers, bypassing user auth | `src/api/external-system/` + `ExternalSystemAuthGuard` | always on (needed from Phase 1 onward for infra/health-adjacent internal calls) |
| **Mailer** (`services/mailer`, Mailgun) | **all 4** | Templated transactional email | **Not carried as Mailgun.** Recommend Azure Communication Services instead — see rationale below | `MAIL_ENABLED`, mirrors papi-authority's own gating |

**Explicitly NOT generic — stays out of the skeleton even though it looks infrastructure-shaped:**
- **gRPC client wiring** (`connections/grpc`) — the `ClientsModule.registerAsync` wiring shape is
  reusable, but every fork's actual proto/generated clients (`cms`'s `casino-grpc-client.service`,
  `dmp`'s per-service clients) are calls to *that panel's* specific microservices. Ship the wiring
  **convention** in `papi-init-back/CLAUDE.md` (how to add a gRPC client, following papi-back's
  `grpc/index.ts` pattern), not a working client — there is nothing platform-generic to call yet.
- **`awa`/`wallet` gateways** (rmp, dmp) — per-project "data bridge" HTTP calls (player balance
  state) authenticated with **one static shared secret used for every project's URL**
  (`dataBridge.secret`, `awa.service.ts:20-23`). This is money-moving, panel-specific business
  logic, not generic infra — leave it to whichever panel needs it, but flag the single-shared-
  secret-for-all-tenants design as a blast-radius problem for that panel to fix when it forks this
  skeleton, not something to quietly inherit.
- **Message queues (RabbitMQ vs NATS)** — a real, unexplained platform inconsistency: rmp
  publishes via a private `@riskmanagement/event-publisher` package over RabbitMQ; cms connects
  directly to NATS; papi-back and dmp have neither. This is not "pick one for the skeleton" —
  it's evidence the old platform never agreed on an event bus. **Recommendation: do not standardize
  this in papi-init-back at all.** Whichever panel needs eventing brings its own choice explicitly;
  baking a broker into the skeleton would be inventing platform-wide infrastructure inside what's
  supposed to be a values-neutral fork base.

**Mailer rationale:** every old fork uses Mailgun via `nodemailer-mailgun-transport` — a second
mail vendor and credential set alongside papi-authority's own Azure Communication Services choice
(dossier Part H.5 / the ACS env placeholders). Recommend papi-init-back's mailer (when a panel
needs one — invitations themselves stay Azure-only per 0.18, this is for panel-level notifications)
use **ACS** too: one vendor, one credential to rotate, one place the "not on the auth hot path"
gating logic (0.15/0.56's redaction discipline) has already been thought through.

### R.4 — Panel-specific business domains: explicitly OUT of papi-init-back

Confirmed by reading every `@Controller()` route prefix in each fork. None of this belongs in the
skeleton — it is exactly the kind of module a specific forked panel adds for itself.

| Panel | Business modules (route prefix) |
|---|---|
| **rmp** | `bets`, `cashbox`, `player/text-messages`, `projects/operator-types`, `casino`, `transactions-reports`, `promotions`, `notifications` |
| **cms** | `casino/aggregators`, `website-configs`, `casino/providers`, `banners`, `casino/tags`, `retention-tools`, `websitepage`, `promotions`, `casino/games`, `project-theme`, `casino/aggregators-games` |
| **dmp** | `promo/royal-win`, `casino/freespins`, `fees`, `players/freespins`, `transactions`, `promo/cashbacks`, `casino/games`, `promo/royal-sport/prizes` |

Also per-panel-only DB connections that are business data, not identity: `db-connections/{main,
bet-data, obs}` in every fork — these are per-project external business databases (odds/bet data,
observability, the tenant's own "main" schema), unrelated to papi-authority's identity DB and
unrelated to the skeleton. A forking panel wires its own.

### R.5 — Security defects found in the "generic" candidates — fix before implementing, do not port as-is

These are new findings from reading the actual code (not previously in the dossier), each
severe enough to block using the old implementation verbatim, per Part 0.3's "verify each ported
piece is 100% secure" rule:

- **ClickHouse client — SQL injection.** `buildWhereSql`/`buildHavingSql`
  (`clickhouse.service.ts:291-343`) interpolate client-controlled filter values directly into
  query strings (`` `${key} = '${value}'` ``, `` `id = ${betId}` ``, array values joined
  unescaped into `IN (...)`). This is textbook injection against the analytics database. **Fix:**
  use `@clickhouse/client`'s parameterized `query_params` (`{query: 'WHERE id = {betId:UInt64}',
  query_params: {betId}}`) — never string-build a WHERE clause from user input.
- **Image processing — SSRF.** `SharpService.toBuffer` (`sharp.service.ts:21-27`) does
  `axios.get(image)` on any string passed to it — a server-side fetch of an arbitrary
  caller-supplied URL, with no allowlist, no scheme check, nothing stopping a request to
  `169.254.169.254` or an internal service. **Fix:** drop the URL-input mode; accept only an
  already-fetched buffer (the caller fetches, if a URL is genuinely needed, through a hardened,
  allowlisted fetcher — not this service).
- **File storage — unsanitized blob path + trusted content-type.** `AzureStorageService.uploadBlobs`
  (`azure-storage.service.ts:33-54`) takes a caller-supplied `name` used directly as the blob path
  (Azure blob names allow `/`, so this is a path-write primitive if the name isn't
  server-generated) and a caller-supplied `contentType` with no verification against the actual
  file bytes. **Fix:** always generate the storage key server-side (UUID), never accept a
  caller-supplied path; verify the file's real type by magic bytes, not the declared
  `Content-Type`; enforce a max size before the buffer is fully read into memory.
- **HTTP client — logs credentials on failure.** `HttpRequestService`'s error handler
  (`http-request.service.ts:33-37` etc.) logs the full request `data` object on every failed call.
  If papi-init-back's auth-proxy (Phase 3) is built on this pattern unchanged, a failed login
  proxy call to papi-authority **logs the plaintext password**. **Fix:** never log request/response
  bodies on any call this project makes to `/auth/*`, `/sso/*`, or `/users/me/password` — same
  redaction discipline papi-authority already applies to itself (dossier 0.56).
- **Service-to-service guard — timing side-channel + one static key for everyone.**
  `ExternalSystemAuthGuard` (`external-system-auth.guard.ts:20-24`) compares the header to the
  configured key with plain `!==`, and there is exactly one key for every caller. **Fix:** compare
  with `crypto.timingSafeEqual` on fixed-length buffers (reject early only on length mismatch);
  note for later that a single shared key for every internal caller is a full-blast-radius secret
  and per-caller keys are worth revisiting once there's more than one internal caller.
- **`xlsx` package — do not reintroduce.** `ExcelService` depends on npm's `xlsx`, already banned
  for papi-authority (dossier D.3b) for its unpatched prototype-pollution/ReDoS advisories
  (SheetJS moved distribution off npm). **Fix:** use a maintained alternative (e.g. `exceljs`) if
  Excel export is built.
- **CSV export — no spreadsheet-formula neutralization.** `CsvService.exportCsv` writes rows
  verbatim; a value starting with `=`, `+`, `-`, or `@` executes as a formula when the file is
  opened in Excel/Sheets — the exact risk papi-authority's own audit CSV export already neutralizes
  (dossier 0.55, "leading apostrophe" fix). **Fix:** apply the same neutralization to any CSV
  export built here.

---

### S — Pagination & error handling: what NOT to port, what to standardize on instead

Read old papi-back's full pagination stack (`common/pagination/pagination.ts`,
`core/orm/orm.service.ts`'s `pagination()`, the interceptor/decorator) and its
`AllExceptionsFilter`, and cross-checked against papi-authority's actual shipped code (not just
its docs). Two independent, serious findings — one about data returned in **list responses**, one
about data returned in **error responses**. Both are "what the frontend receives" questions, which
is exactly where a government-grade posture cannot inherit convenience code.

**S.1 — Old pagination lets the client control what it sees, with no per-endpoint allowlist.**
`parseGetPaginationParams` (`pagination.ts:10-55`) does `JSON.parse` on raw, client-supplied query
values (`sort`, `range`, `filter`) with **no schema validation**, and:
- `limit` (`range[1]`) has **no upper bound** — a client can request the entire table in one call.
  Contrast papi-authority's own `PaginationQueryDto` (`src/core/http/pagination.dto.ts:17-29`),
  which caps `limit` at 200 **explicitly for this reason** (its own comment names the exact
  vulnerability: "an uncapped page size... turns a single over-permissioned account into a bulk
  export").
- `orderField` (`sort[0]`) is taken verbatim from the client and used as
  `{[options.orderField]: options.order}` — a live TypeORM `order` key — in `orm.service.ts:58-60`.
  Not classic SQL injection (TypeORM's object-form `order`/`where` parameterize values), but it
  lets a caller sort by **any** column on the entity, with no allowlist, and an unrecognized field
  throws a TypeORM metadata error with no guarantee the exception filter (S.2) sanitizes it.
- `options.filter` is spread directly into `where`, and can carry `select`/`relations` keys
  (`orm.service.ts:78-89`) that are **also forwarded verbatim** — meaning a caller can request
  `select: ['password']` (or any other sensitive column the entity has) on any endpoint built on
  this helper, with nothing stopping it at the framework level. This is the actual data-exposure
  risk, not a theoretical one: the helper does not know which columns are sensitive, and never
  asks.

Contrast papi-authority's real, already-correct pattern (verified in
`admin-panels.service.ts:63-69` and `projects.service.ts:51-57`): the sort **column is hardcoded**
in the service (`.orderBy('panel.name', query.order ?? 'ASC')` — the client only ever controls
direction), and free-text search goes through a **parameterized** `LIKE :search` on named columns
the service itself chose. No client-controlled column names, ever.

**Recommendation for papi-init-back:** ship papi-authority's `PaginationQueryDto` shape verbatim
(capped `limit`, `page`, `search`, `order` direction only) as the skeleton's pagination convention
— not old papi-back's `parseGetPaginationParams`/`orm.service.ts` pattern. Document in
`papi-init-back/CLAUDE.md`: **a paginated endpoint hardcodes its own sortable column(s) and its
own searchable column(s) in the service** — `order`/`search` from the client select *behavior*
never *which column*. Any future fork's list endpoint that wants a client-selectable sort column
must run it through an explicit `enum`/allowlist DTO field, never a free-text field forwarded into
`order`/`select`.

**S.2 — Old error handling passes 4xx bodies to the client unsanitized, and the leak is not
theoretical.** `AllExceptionsFilter` (`services/logging/http-exception.filter.ts:15-28`) does the
right thing for 5xx (generic `"Internal Server Error"`, real detail only logged) but for **any**
4xx `HttpException` returns `exception.getResponse()` straight through with **no sanitization at
all**. This is exploitable wherever a handler constructs an exception from caught internal state —
confirmed **live**, not hypothetical: `rmp-backend/src/api/transactions/services/
transactions.service.ts:594,641` — `throw new BadRequestException(data.message)`, forwarding an
upstream/internal error message verbatim to whoever called the endpoint. The generic
`HttpRequestService.throwErrorIfResponseNotOk` (Part R.3's HTTP client) does the same thing by
design (`errorData?.data?.message || errorData?.message`).

**papi-authority itself has no exception filter at all** to compare against or copy from — logged
separately as **dossier decision 0.63** (`papi-authority-plan.md`) — so this design is being
created fresh here, for both services to eventually share, not ported from either.

**Recommendation — a shared exception-filter contract (RFC-9457 `application/problem+json`,
already promised by both services' docs, now actually specified):**
- **DTO validation failures** (`ValidationPipe`'s 400s) pass through structured — they only ever
  name DTO field/constraint violations, never internal state, so this is safe by construction and
  useful to the frontend as-is.
- **A deliberately thrown business exception** (`throw new ForbiddenException('SSO is disabled
  for this panel.')` — a static, developer-authored string) passes its message through. This is
  the normal, intended case and is what most of papi-authority's own code already does correctly.
- **Anything else — any exception not deliberately authored as a client-facing message, including
  an `HttpException` built from a caught error's `.message`/`.stack`, and every uncaught
  error/5xx** — collapses to one generic message per status code family. The real detail is logged
  server-side, correlated by the request-id both services already generate and echo (papi-authority
  Phase 1's `ClsModule`/request-id pattern), and that same request-id is returned in the problem
  response's `instance` field so a user can report "error ref `<id>`" without ever seeing the
  internal text.
- **The dividing line is authorial intent, not exception type** — an `HttpException` is not
  inherently safe to pass through; whether *this specific instance* was constructed with a static
  message or with borrowed internal text is what decides it. Since a filter cannot detect that
  automatically, the actual enforcement is a coding rule: **never construct an exception's message
  from a caught error's own message/response body** — always write a static string and log the
  original underneath. Call this out explicitly in `papi-init-back/CLAUDE.md`'s conventions, the
  same way `process.env`-outside-configs is called out and lint-enforced elsewhere.

## Consequence for the tech plan

`papi-init-back-tech-plan.md` gets a new **Phase 6 — Generic infrastructure modules**, inserted
before the hardening sweep (old Phase 6 renumbered to Phase 7), covering R.3's opt-in services
with R.5's fixes built in from the start — not patched on after copying the old code.
