# papi-authority — Tech Plan (v1, phased)

> **For agentic workers:** this is the phase-level execution plan. Work happens **one phase at a time**: at each phase kickoff, produce the phase's detailed design + bite-sized task breakdown (per `superpowers:writing-plans` — exact files, code, tests), present it to the user, **get approval, then implement**. Do not start a phase's implementation without approval (Dossier Part 0.7).
>
> **Companion dossier (the "why" and every current-state fact):** `papi2/.claude/papi-authority-plan.md` — read it in full before Phase 1. Its Part 0 holds the freshest locked decisions; its Part O maps the read-only reference monorepo at `/Users/rafayelmovsesyan/Desktop/nrg/platform-admin`.

**Goal:** Build `papi-authority` — the platform's single identity + authorization authority and only token issuer — from scratch, at `/Users/rafayelmovsesyan/Desktop/papi2/papi-authority/`.

**Architecture:** One hardened NestJS service owning one MySQL DB split into identity tables and auth-runtime tables (two least-privilege DB users). It authenticates (password/2FA/lockout/SSO per admin panel's DB-configured auth modes), computes a 4-layer effective permission map per project, bakes it into short-lived RS256 access tokens verified by consumers against its JWKS, rotates refresh tokens with family reuse-detection, handles invite-only onboarding with a standalone join page, and audits every auth action with geo-IP + device data.

**Tech Stack (pinned 2026-08-05 from the npm registry + an empirical build probe — see Dossier 0.12–0.16):**

| | Pin | Note |
|---|---|---|
| Node | **24.19.0** (Active LTS, `.nvmrc` + `engines`) | bump to 26 due ~Nov 2026 — Dossier 0.13 |
| TypeScript | **6.0.3** | **NOT 7** — Nest CLI cannot build on TS 7. Dossier 0.12 |
| NestJS | **11.1.28** (CLI 11.0.24, schematics 11.1.0) | no v12 exists |
| TypeORM | **1.1.0** | first major in 8 yrs; `@nestjs/typeorm@11.0.3` peer-accepts `^1.0.0-dev`; drops `TYPEORM_*` env auto-loading (good — config comes only from `src/configs`) |
| MySQL | **`mysql:8.4`** (LTS image) + `mysql2@3.23.2` | 9.x is the innovation line — not for a gov-grade service |
| Validation | **class-validator 0.15.1 + class-transformer 0.5.1** | config *and* DTOs — Dossier 0.14 |
| Hardening | helmet 8.3.0, `@nestjs/throttler` 6.5.0, nestjs-cls 6.2.1 | |
| Crypto/auth | `jose`/`jsonwebtoken` (RS256 issuance), `jwks-rsa` 4.1.0 (inbound Azure verify), bcrypt 6.0.0 | password-hash algorithm to be re-confirmed at Phase 4 (argon2id vs bcrypt) |
| Azure (env-placeholder) | keyvault-keys 4.10.2, identity 4.13.1, communication-email 1.1.0 | |
| Logging | **company-internal package — supplied by the user at the final steps** | do NOT build or install a logger. Dossier 0.15 |

**Do not re-pin from memory.** Re-verify against the npm registry at each phase kickoff; the TS 7 trap above is exactly what memory-based pinning produces.

## CURRENT STATE — updated 2026-08-06

**Phases 1–9 are COMPLETE. Formal end-to-end verification is NOT yet done — it moves to Phase 10, after the platform owner's review (decision 0.57), and will be owned by dedicated QA agents.**

> The evidence column below records **build-time smoke checks** made while implementing each phase. They are real and were run, but they are not the Part M pass and must not be presented as it.

| Phase | State | Evidence |
|---|---|---|
| 1 — scaffold, config, DB principals | ✅ done | boots; invalid env dies listing all problems; drain returns 503 then exits cleanly; CORS rejects unlisted origins; request-id echoed |
| 2 — data model + migrations + grants + seeder | ✅ done | 22 tables · 24 FKs · 61 indexes; 3 migrations; grants proven by attempting every forbidden operation as each principal |
| 3 — crypto / Key Vault + JWKS | ✅ done | tokens cross-verified with `jsonwebtoken`; DI blocks `KEY_PROVIDER` outside `CryptoModule`; 3 independent barriers against a dev key in prod |
| 4 — auth engine | ✅ done | login/refresh/logout; replaying a rotated refresh token revokes the family; lockout at 10; panel auth-mode, soft-deleted and inactive users all rejected; audit rows written |
| 5 — authorization engine | ✅ done | 12 resolver assertions; L2 demonstrably gates L3 on a live token; `permissions:check` exits 1 on drift, 0 when clean |
| 6 — SSO + invitations | ✅ done | `platform` claim + `@PlatformPermissions` (6 guard assertions); invite → validate → accept with tokens stored hashed and **no `users` row**; SSO and accept both gated on the panel's `sso_auth_enabled`; expiry, duplicate and permission checks enforced; `open_sso` creates an accepted invitation only; CORS admits `INVITATION_ORIGIN`. **No join page** (0.19) — contract documented in `docs/invitation-endpoint-contract.md` |
| 7 — identity CRUD API | ✅ done | Invitation **approval is atomic** on the console connection (user + grants + audit + delete of the invitation, one transaction) — the Part N blocker, closed by 0.44; grants re-verified by execution: console `INSERT` on audit ALLOWED, `UPDATE`/`DELETE` DENIED, `token_hash` unreadable and unwritable, authority still denied `is_active`/`role_id`/user INSERT; 0.46 proven both ways (profile edit → refresh 200, access change → 401); unauthorize revokes and blocks re-login; 0.48 refuses all four self-lockout paths and role-orphaning delete; L4 grant outside the L2 ceiling rejected, deny allowed; default-deny confirmed 403 on all six new surfaces for a role granting nothing. Two defects found and fixed: **0.51** (`@IsUUID('4')` rejects every UUIDv7 id — was live since Phase 6) and **0.52** (`Boolean('0')` from the driver inverted `hasPassword`) |
| 8 — audit + hardening | ✅ done | Geo-IP from **local** MaxMind `.mmdb` (0.53), verified against MaxMind's own test databases: `81.2.69.142 → GB/London`, `1.128.0.1 → AS1221 Telstra`; a **missing** database still boots, still authenticates, and degrades to NULL. `x-forwarded-for` **ignored** at `TRUSTED_PROXY_HOPS=0` (recorded the real socket IP) and honoured at `1`. Audit query API on the *authority* connection with 10 indexed filters; `audit.view` grants search+count but **not** export (403). CSV export requires an explicit range, is capped at 50k, and **neutralises spreadsheet formulas** (`=cmd\|"/c calc"!A1` stored with a leading apostrophe). Closed the `TokenFamilyRevoked` and `InvitationSent` coverage gaps. Redaction ruleset + **10 passing tests** (`npm test`, Node's built-in runner, no framework added). Hardening re-verified: CSP/HSTS/nosniff/frame-options present, no `x-powered-by`, CORS allow-list rejects `evil.com` *and* `rmp.nrg.local.evil.com`, 413 on a 2 MB body, 429 after 5 failed logins, `x-request-id` echoed. Retention runbook written (`docs/audit-retention-runbook.md`) |
| 9 — handover + Part M reconciliation | ✅ done | Part M amended in place where 0.18 / 0.20 / 0.23 / 0.45 / 0.25 superseded it (0.58); DB handover package generated by `npm run handover:generate` into `docs/db-handover/` — schema DDL from `mysqldump` (captures the generated `deleted_marker` and the CHECK that TypeORM drops), grants verbatim, hand-authored forbidden-statement acceptance script, README with the security rationale, `facts.json` |

**Gate re-run 2026-08-11 (all green, on the committed tree):** `typecheck` clean · `lint` clean at `--max-warnings 0` · `build` clean · `test` 10/10 pass · `permissions:check` "catalog and database agree (41 permissions)" · `migration:show` all 3 applied · boot smoke: 60 routes mapped, `/live` 200, `/ready` 200, JWKS serves the RSA key with `kid`, `/api/users` 401 unauthenticated, CSP/HSTS/nosniff/frame-options present, no `x-powered-by`, `x-request-id` echoed, clean shutdown. **Still build-time smoke checks, not the Part M pass.**

**Post-completion change 2026-08-11 — `tsconfig.json` audit (decisions 0.59 / 0.60).** Re-audited against the installed toolchain (`typescript@6.0.3`, Node v24.19.0). Applied: `target`/`lib` `ES2023 → ES2024`; `module` `node16 → node20` (`moduleResolution` stays `node16` — TS 6 enforces that pairing via `TS5109`); the `types: ["node"]` comment corrected (TS 6 **does** auto-include `@types/*` — the option is kept for ambient-surface control, not necessity); **`useDefineForClassFields: false` pinned explicitly**, which was silently `true` and probe-verified to make `Object.assign(entity, patchDto)` wipe untouched columns. Re-verified unchanged: no `baseUrl` (`TS5101`), `moduleResolution: node`/`node10`/`classic` deprecated (`TS5107`), decorator flags not deprecated in TS 6. Gates after the change: `typecheck` 0 · `build` 0 (emit still `dist/main.js`, not `dist/src/`) · `lint` 0 at `--max-warnings 0`. **Not committed.**

**Runtime facts a fresh session needs:**
- Node must be pinned per invocation: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` — the default shell resolves to v22.
- Local stack: `docker compose up -d` → `npm run migration:run` → `npm run db:grants` → `npm run seed`.
- `.env` exists locally (gitignored, throwaway credentials); MySQL runs on port **3399**; the **service listens on `PORT=7780`**, not Nest's default 3000 (smoke-checking `localhost:3000` returns connection-refused and looks like a boot failure).
- The seeder does **not** set a password (0.34 was decided after Phase 2); set one with `PasswordHasherService.hash()` to log in as `admin` / `admin@nrg.local`. Hashing requires Node 24 (built-in argon2), so run it against `dist/`, not `src/`.
- Re-applying grants locally: `docker exec -i papi-authority-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < docker/mysql/grants.sql` (root password is in `.env`). Grants changed in Phase 7 — re-run after pulling.
- `UID` is a readonly variable in bash; do not use it in verification scripts (it silently aborts the script under `set -u`).
- Gates before declaring anything done: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test`, `npm run permissions:check`.
- `npm test` runs Node's **built-in** runner against `dist/` (no test framework is installed — the `$/` alias only exists after `nest build`, same reason as `seed`/`migration:*`). Test files are CommonJS `.js` under `test/`.
- Geo-IP is **off** locally (`GEOIP_ENABLED=0`): GeoLite2 files are licence-gated and not in the repo. To exercise it, fetch MaxMind's test databases from `github.com/maxmind/MaxMind-DB/tree/main/test-data` and point `GEOIP_CITY_DB`/`GEOIP_ASN_DB` at them — `81.2.69.142` resolves to GB/London, `1.128.0.1` to AS1221.
- **CORS locally:** with `NODE_ENV=local` AND an empty `CORS_ORIGINS`, main.ts allows every origin by design. Set `CORS_ORIGINS` before concluding CORS is broken.
- `npm run handover:generate` regenerates `docs/db-handover/` from a live migrated DB. Needs `DB_MIGRATOR_URI` and the running container; re-run it after ANY migration.
- **Committed as of 2026-08-11:** commit `16db6b6` "feat: papi-authority — central identity, auth and authorization service" on `main`; working tree clean. (This line previously read "nothing has been committed" — corrected 2026-08-11.)

**Phase 6 is approved** with decisions 0.41 (jwks-rsa + jsonwebtoken), 0.42 (double-gated dev token exposure) and 0.43 (`platform` claim + `@PlatformPermissions`). Build order: the `platform` claim first (Phase 7 depends on it), then invitations, then SSO.

**Phase 7 is approved** (2026-08-06) with decisions **0.44** (console gets `INSERT`-only on `auth_audit_events`; approval is one transaction on the console connection — this closes the Part N ⚠ blocker), **0.45** (`/users/me` self-service on the authority connection), **0.46** (revoke refresh families on security-relevant changes only), **0.47** (soft-delete identities, hard-delete join rows), **0.48** (refuse self-lockout and role-orphaning writes). Build order: grant amendment + approval first, then the CRUD modules, then `/users/me` and unauthorize.
**Phase 8 is approved** (2026-08-06) with decisions **0.53** (local MaxMind `.mmdb`, never a remote geo-IP API), **0.54** (audit retention is a DBA job under a separate maintenance principal — neither runtime principal can delete a row), **0.55** (full audit rows behind `audit.view`, query runs on the *authority* connection), **0.56** (redaction ruleset only, no interim logger). Most Phase 1 hardening is already in place; this phase verifies it item-by-item.


## Global Constraints (apply to every phase)

- **From scratch** — no bulk-copying modules from platform-admin. Individual guards/middleware/helpers MAY be ported only after verifying each is 100% secure + current best practice (Dossier Part 0.3).
- **platform-admin (`/Users/rafayelmovsesyan/Desktop/nrg/platform-admin`) is read-only** — never modify anything there.
- **MySQL**, TypeORM **migrations only** — `synchronize` is forbidden in all environments.
- **UUIDv7** PKs for all identity data; storage format (`BINARY(16)` vs `CHAR(36)`) decided at Phase 2 kickoff.
- **Default-deny** authorization everywhere (papi-back's default-deny, not rmp's accidental default-allow).
- **Env-driven infra config**, validated at boot, fail-fast; never read `process.env` outside `src/configs`. Per-admin-panel auth settings (SSO tenant/client id, auth-mode flags) live in the **DB**, not env (Dossier Part 0.4/0.5).
- **No Redis** (Dossier B.8). Access-token TTL (~5 min default, env) is the revocation ceiling.
- **Secrets:** RS256 private key only via Azure Key Vault in prod; non-prod-only dev key mode; no secret material in DB, logs, or committed files.
- **papi-back skeleton conventions** (`papi-back/CLAUDE.md`): `$/`→`src/` alias, per-domain `module/controllers/services/entities/dto`, entity triple-registration (forFeature + config `entities[]` + CLI data-source), `RouterModule.register` + `imports` in `api.module.ts`.
- **Per phase:** `npm run build` and `tsc --noEmit` must pass before the phase is declared done. Full end-to-end verification (Dossier Part M) runs after Phase 8.
- **Never `git commit` unless the user explicitly asks.**

## Working agreement (cadence — Dossier Part 0.7)

1. **Kickoff:** read the dossier sections the phase cites; verify cited reference code in platform-admin still matches (line numbers may drift); write the detailed task plan; present it.
2. **Approval:** user approves (or amends) the phase plan.
3. **Implement:** execute task-by-task; build/type-check clean.
4. **Report:** show what was built + how it maps to the phase's exit criteria; user signs off; next phase.

---

## Phase 1 — Scaffold, config module, two-DB-user setup

**Objective:** A booting, empty-but-hardened NestJS service at `papi2/papi-authority/` with validated fail-fast config and local MySQL infrastructure.

**Deliverables:**
- `papi-authority/` scaffolded fresh (latest Nest CLI; versions pinned via **context7** at kickoff): `src/main.ts`, `src/app.module.ts`, `src/api/api.module.ts` (empty), `tsconfig` with `$/` alias, ESLint/Prettier per skeleton conventions.
- `src/configs/` — single config source (`index.configs.ts` + validation schema): `PORT`, `NODE_ENV`, TTLs (access ~5 min, refresh expiry), `ONBOARDING_MODE` (`invite_only` default), two DB URIs (`DB_AUTHORITY_URI` = authority user, `DB_CONSOLE_URI` = future access-control user), Key Vault + ACS + geo-IP + CORS allow-list + throttle namespaces — all placeholders allowed in dev, all validated.
- Both TypeORM DataSources wired (authority + console) per the Dossier Part G note — the identity CRUD module (Phase 7) uses the console one; everything else uses the authority one.
- **Global ThrottlerGuard baseline** (papi-back guard order: Throttler → Jwt → Permission) — per-route tuning happens in Phase 8, but public routes are rate-limited from day one.
- `papi-authority/CLAUDE.md` — the service's own conventions doc (skeleton rules, `$/` alias, entity registration checklist, env-gating, "platform-admin is read-only") so every future session/agent in the code dir self-orients.
- `docker-compose.yml` — MySQL 8 for local dev + an init script creating the DB and the **two DB users** (grants become real in Phase 2 when tables exist).
- `.env.example` fully enumerating every variable with comments.
- Boot smoke: invalid/missing env → clear fail-fast error; `npm run build` clean.

**Exit criteria:** service boots with valid env, dies loudly with invalid env; docker MySQL up with both users; build + type-check clean.

**Build notes discovered during T1–T3 (2026-08-05):**
- **ESLint is capped at 9.x, not 10.** `eslint-plugin-import` peers on `^8 || ^9`; everything else (typescript-eslint 8.66, prettier plugins) already accepts ESLint 10. Resolved set: `eslint@9.39.5` + `@eslint/js@^9`. Revisit when `eslint-plugin-import` adds ESLint 10.
- **`"types": ["node"]` is required explicitly.** TS 6.0.3 did **not** auto-include `@types/node` under `moduleResolution: node16` — `process` failed to resolve with `TS2591` despite the package being installed. Explicit `types` also prevents an unexpected global type package from silently widening the ambient surface.
- **TypeORM CLI runs against compiled JS, not ts-node.** Scripts are `npm run build && typeorm -d dist/typeorm-cli-data-source.js …`. Rationale: `tsconfig-paths` requires `baseUrl`, which we deliberately removed (0.16), so the ts-node path would not resolve `$/` imports. The Nest CLI already strips all aliases at emit, so the compiled data-source needs no alias resolution at all — and this removes papi-back's `src/*.ts` (CLI) vs `dist/*.js` (runtime) asymmetry that Atlas flagged as a latent inconsistency.
- **TypeORM 1.0 removed `name` from `DataSourceOptions`** (`TS2353` on `MysqlDataSourceOptions`). It belonged to the pre-1.0 multi-connection API. The connection name is now passed to `TypeOrmModule.forRootAsync({ name })` instead. Also: `migrations` is typed as the mutable `MixedList`, so an `as const` shared-options object is **not** assignable — keep it mutable.
- **`incremental: true` + nest-cli `deleteOutDir` produces silently PARTIAL builds.** Verified: after editing one file, `nest build` emitted **only that file** — a stale `.tsbuildinfo` told tsc the rest were already emitted, while `deleteOutDir` had just wiped them. Set `incremental: false`. papi-back enables `incremental` and carries the same latent hazard. Also add `*.tsbuildinfo` to `.gitignore`.
- **MySQL 8.4 refuses grants on tables that do not exist** — `GRANT SELECT ON db.users TO …` → `ERROR 1146 (42S02): Table 'db.users' doesn't exist`. And `GRANT USAGE` is not enough to even select a schema (`ERROR 1044 Access denied`). So the runtime principals cannot be granted anything meaningful until the schema exists. The local init script therefore gives them a **temporary schema-wide `SELECT`** purely so Phase 1 is bootable — see the Phase 2 requirement below.
- **`app.enableShutdownHooks([])` registers EVERY signal, not none.** Nest source (`nest-application-context.js:169`): `if (isEmpty(signals)) signals = <all ShutdownSignal>`. Its handler calls `app.close()` immediately, racing any drain window — verified: `/ready` returned connection-refused instead of 503, and TypeORM's shutdown hook then threw from running twice. **Do not call `enableShutdownHooks` at all**; lifecycle hooks still fire from the explicit `app.close()`.
- **`ClsModule`'s `middleware.setup` hook does not fire** (verified with a static test value that never reached the response). Correlation-id echo is therefore its own express middleware mounted first in `main.ts`; `ClsModule`'s `idGenerator` then reads the header that middleware normalized, so the CLS id and the echoed header are always identical.
- **Reject CORS origins with `callback(null, false)`, never `callback(new Error(...))`.** The Error form surfaces an HTTP **500** for what is merely a disallowed origin, polluting error monitoring; omitting the header is the correct CORS semantic.
- **`UNIQUE (col, deleted_at)` does NOT make `col` unique among live rows.** MySQL treats NULLs as distinct in a unique index, so every live row (`deleted_at IS NULL`) is mutually non-colliding. Verified: a duplicate live email was accepted. Use a generated `deleted_marker` column instead (dossier 0.29). Any future soft-deletable table must follow the same pattern.
- **TypeORM's MySQL driver silently drops `@Check()`** — no CHECK constraint reaches the DDL and no warning is emitted. Emit check constraints by hand in the migration, and do **not** leave a `@Check()` decorator in the entity implying a guarantee the database does not have.
- **`migration:generate` output must be hand-reviewed.** In the first generation it produced: a duplicate unique index on `project_blockers.project_id` (an explicit `@Index` on top of the one `@OneToOne` + `@JoinColumn` already creates), asymmetric join-table FKs (owning side `ON DELETE CASCADE`, inverse side `NO ACTION`), and the missing CHECK above. The first two were fixed in the entities so they stay drift-free; only the CHECK needs hand-editing.
- **Set `onDelete: 'CASCADE'` on BOTH sides of a `@ManyToMany`**, otherwise the inverse-side FK is emitted as `NO ACTION` and deleting that parent is blocked by its own join rows.
- **A database-scoped `REVOKE` does not clear table/column grants.** `REVOKE ALL PRIVILEGES ON db.* FROM u` leaves table- and column-level grants in place. `grants.sql` must use `REVOKE ALL PRIVILEGES, GRANT OPTION FROM u` — which strips everything — or the file stops being an authoritative description of who may do what, and Phase 1's temporary blanket `SELECT` silently survives.
- **A filtered `DELETE` needs `SELECT` on the WHERE-clause columns.** `DELETE FROM two_factor_state WHERE user_id = ?` fails with `ERROR 1143` when the principal holds `DELETE` alone. Granting column-level `SELECT (user_id)` fixes it while still denying reads of `secret_encrypted` — verified. The same applies to any future delete-only grant.
- **`ERROR 1142` vs `ERROR 1143`** distinguishes a table-level denial from a column-level one — useful when verifying that column-scoped grants (0.23's self-service columns, the console's `revoked_at`) are doing their job rather than being masked by a broader table grant.
- **`jose@6` is ESM-only** (`type: module`, no CommonJS entry) — unusable in this build, same trap as `uuid`. `jsonwebtoken@9` and `jwks-rsa@4` are CommonJS. The Azure SDKs (`@azure/keyvault-keys`, `@azure/identity`) publish `dist/commonjs` entries and are fine. Since remote signing cannot use a JWT library anyway (0.32), no signing library is a dependency; `jsonwebtoken` is a **devDependency** used only to cross-verify emitted tokens.
- **Key Vault's `sign('RS256', digest)` takes a PRE-COMPUTED SHA-256 digest**, not the raw signing input, and prepends the RFC 8017 DigestInfo prefix internally. Passing raw input produces signatures that verify nowhere. When emulating it in a test stand-in, the prefix `3031300d060960864801650304020105000420` must be prepended before `privateEncrypt` with PKCS#1 padding — signing the bare digest fails verification (this bit me once; the provider was correct and the harness was wrong).
- **`kid` is an RFC 7638 JWK thumbprint**, so it is deterministic: the same key always yields the same `kid`, a restart cannot orphan in-flight tokens, and two providers holding one key agree on its identifier. The member ordering in the canonical JSON (`e`, `kty`, `n`) is fixed by the RFC — do not "tidy" it.
- **⚠ Registering a global `JwtGuard` breaks every public endpoint until it is marked `@Public()`.** Caught in Phase 4: after adding the guard, `/live`, `/ready` **and `/.well-known/jwks.json` all returned 401** — the JWKS one is platform-fatal, since every fork fetches it unauthenticated to verify tokens. Any controller added outside the authenticated API must carry `@Public()`, and this is worth re-checking whenever a new global guard is introduced.
- **PHC parameter order is not fixed.** The argon2 reference (and this service) emit `m,t,p`; the `argon2` npm package emits `m,p,t`. A positional regex silently fails to verify perfectly valid hashes from other tools — parse the parameter segment as unordered `key=value` pairs. Caught only because output was cross-verified against an independent implementation.
- **TypeORM `insert()` rejects a plain object for a JSON column** (`QueryDeepPartialEntity` typing); use `save()` with `create()` for entities carrying JSON.
- **The throttler fires before account lockout**, so a lockout test will see 429s rather than 401s unless the rate limit is raised for the test. Both defences are wanted — the throttler is IP-scoped, lockout is account-scoped — but they mask each other in verification.
- **Husky lives at the repo root**, not in the service — `.git` is at `papi2/`, so `prepare: husky` inside `papi-authority/` fails with "`.git` can't be found". Hooks are a repo-root concern; the service keeps only its `lint-staged` config.

**Deliberate divergences from papi-back** (Dossier D.7 has the evidence; every one of these must be restated in `papi-authority/CLAUDE.md` with its reason, so no future agent "fixes" us back to the weaker baseline):

| Divergence | Why |
|---|---|
| Full `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; `target/lib ES2023` | papi-back runs `strictNullChecks:false`, `noImplicitAny:false`, `target ES2021` — it disables detection of exactly the null/undefined bug class that lives in token and permission paths |
| Type-aware ESLint (`recommended-type-checked`, `no-floating-promises`, `no-misused-promises`); `no-explicit-any` **on** | papi-back configures `parserOptions.project` but enables zero type-aware rules and turns `no-explicit-any` off — a floating promise in a guard is an auth bug |
| `no-restricted-properties` banning `process.env` outside `src/configs/**` | papi-back documents the rule in CLAUDE.md but never enforces it — 5 files violate it today |
| Explicit `rootDir: "./src"` + `include` | papi-back compiles `scripts/` too, so output lands at `dist/src/main.js`; its `start:prod` (`node dist/main`) and Docker `CMD` are both broken as written |
| `paths` without `baseUrl`; `module`/`moduleResolution: node16` | `baseUrl` + `node10` are deprecated in TS 6, removed in TS 7 — Dossier 0.16 |
| `app.set('trust proxy', TRUSTED_PROXY_HOPS)` before anything IP-keyed | papi-back has no trust-proxy setting and `getIp.ts` blindly trusts `x-forwarded-for` → **throttler keys and audit IPs are client-spoofable**, defeating lockout and forging the audit trail Part M requires |
| Named per-route throttlers | papi-back has one global 100/60s IP-keyed bucket |
| `setGlobalPrefix('api')` instead of `RouterModule` triple-listing. **No URI versioning** (Dossier 0.17) | papi-back lists every module 3× and its own CLAUDE.md admits a module missing from one list silently loses its `/api` prefix. Routes are `/api/auth/login` — no `/v1/` segment |
| ValidationPipe **without** `enableImplicitConversion`, **with** `forbidUnknownValues` | silent coercion interacts badly with `forbidNonWhitelisted` |
| RFC-9457 exception filter registered in **all** envs | papi-back skips it locally, so local error shapes differ from prod |
| Single owner for `/live` + `/ready`; no DB error text in responses; `/metrics` never public | papi-back registers `/live` + `/ready` in two controllers (latent routing conflict), returns a 200 body containing `statusCode: 503`, leaks raw DB error text anonymously, and exposes `/metrics` with `@Public()` |
| Real drain window: mark → wait `READINESS_DRAIN_MS` → `app.close()` with timeout → exit | papi-back marks shutting-down and calls `app.close()` immediately — draining is advertised but never happens, and a hung pool blocks SIGTERM forever |
| A third DDL-only DB principal (pending approval — see Phase 1 Q8) | neither the authority nor the console user should hold `ALTER`/`DROP` on tables they are otherwise constrained on |
| No `xlsx`; `dotenv` declared explicitly if used | papi-back ships the npm `xlsx` copy with unpatched advisories, and imports `dotenv` as a phantom (undeclared) dependency |
| Key Vault path is **net-new**, not ported | papi-back's `bootstrapSecrets()` exists but is **never called** — there is no working prior art to copy for Phase 3 |

## Phase 2 — Data model + migrations

**Objective:** The full schema of Dossier Part G as TypeORM entities + migrations, with table-level grants enforcing the identity/auth-runtime split.

**Deliverables:**
- **Decision at kickoff:** UUIDv7 column storage (`BINARY(16)` vs `CHAR(36)`) — recommendation presented with trade-offs, user approves.
- Identity entities: `users` (identity superset per D.2/D.5 + `token_epoch`; **NO lockout/2FA columns — Part 0.10**; fully read-only to the authority DB user), `projects` (superset per D.3/D.5), `project_limits`, `project_operators`, `project_operator_op_types`, `project_blockers` (+ `OperatorType`/`RequiredLevel` enums), `user_roles`, `admin_panels` **+ per-panel auth config columns: `basic_auth_enabled`, `sso_auth_enabled`, `sso_tenant_id`, `sso_client_id`** (Part 0.4/0.5 — SSO columns are nullable overrides, NULL → platform default per Part 0.9), `platform_settings` (single row: platform Azure app default tenant/client — Part 0.9), `project_entitlements` (L2), `user_project_permissions` (L4), join tables `user↔projects` (L1), `user↔admin_panels`, `user→role`.
- Auth-runtime entities: `refresh_tokens` (SHA-256 hash, `family_id`), `invitations` (**full onboarding lifecycle per Dossier Part 0.8**: status `created→sent→accepted→approved/rejected/expired` + fields captured at accept — `oid`, password hash, profile), `auth_audit_events`, `login_lockouts` (per-user lockout state — Part 0.10), `two_factor_state` (ALL 2FA fields: enabled/secret/pending pair — Part 0.10).
- **⚠ The grants migration MUST start with `REVOKE`.** Phase 1's local init script grants `papi_authority` and `papi_console` a **temporary schema-wide `SELECT`**, because MySQL rejects table-level grants before the tables exist and `USAGE` alone cannot even select a schema. The grants migration must therefore begin with `REVOKE ALL PRIVILEGES ON \`<db>\`.* FROM 'papi_authority'@'%';` and the same for `papi_console`, **before** applying precise table/column grants — otherwise the temporary blanket SELECT silently survives and every identity *and* auth-runtime table is readable by both principals, defeating B.3/0.25. Revoke-then-grant also makes the migration idempotent and authoritative. This temporary grant must never appear in the Phase 9 handover package.
- Migrations (CLI data-source wired) + a **grants migration/script**: console user = CRUD identity / no auth-runtime; authority user = SELECT identity / CRUD auth-runtime; **authority user gets ZERO write grants on identity tables** (Parts 0.8 + 0.10 — lockout/2FA state lives in auth-runtime, so no column exceptions); identities are created only by the console user at invitation approval.
- Dev seeder: one admin user (password mode), one admin panel with `basic_auth_enabled=true` + placeholder SSO config, one project, one role, sample entitlements.

**Exit criteria:** `migration:run` from empty DB succeeds; grants verified by connecting as each DB user and attempting forbidden reads/writes (fails); seeder produces a loginable dataset; build clean.

## Phase 3 — Crypto / key management + JWKS

**Objective:** The only component that touches the private key: load, sign, publish JWKS.

**Deliverables:**
- `src/api/crypto/` (or `src/core/crypto/` — decide at kickoff): key-provider abstraction with two implementations — **Azure Key Vault** (env-configured, required in prod) and **dev-local key** (non-prod only, env-gated; generated or local PEM). Prod boot without Key Vault config MUST fail.
- Token-signing service (RS256, `kid` in header) — the private key never leaves this module's boundary; no other module can inject it.
- `GET /.well-known/jwks.json` — public, cacheable (sensible `Cache-Control`), serves current public key(s) with `kid`; structure supports future key rotation (multiple keys).

**Exit criteria:** in dev mode a token signed by the service verifies against its own JWKS endpoint (`algorithms:['RS256']`, `iss`/`aud`); prod-mode boot without Key Vault fails; build clean.

## Phase 4 — Auth engine (password login, refresh, logout) + RS256 issuance

**Objective:** Working credential auth issuing the real multi-project access token + rotating refresh token.

**Deliverables:**
- `src/api/auth/`: `POST /auth/login` (panel-aware: rejects if the target panel has password mode disabled — Part 0.5; case-insensitive lookup, bcrypt, lockout counters in `login_lockouts` and 2FA via `two_factor_state` — Part 0.10), `POST /auth/refresh` (rotate + family reuse-detection → revoke family; re-reads live permissions), `POST /auth/logout` (revoke family). All public + throttled.
- Access-token claims per Dossier Part I: `sub` (UUID), `panel`, `projects: { [projectId]: {pages, apis} }` (placeholder resolver until Phase 5 — shape final, content stubbed from role permissions), `epoch`, `jti`, `iat`, `exp`.
- Refresh tokens: 48 random bytes, SHA-256 stored, `family_id`, rotation semantics per papi-back prior art (re-implemented, reviewed).
- Global guards for papi-authority's own API: JWT guard (verifies own RS256 tokens) + default-deny permission guard skeleton (full resolver in Phase 5).
- Audit hook points emitted at every auth event (login ok/fail, lockout, refresh, reuse-detect, logout) as structured logs — Phase 8's audit module replaces the sink with `auth_audit_events` rows.

**Exit criteria:** login with seeded user returns verifiable access token with correct claims shape + refresh token; refresh rotates; reusing a rotated refresh token revokes the whole family; lockout triggers after N failures; login via disabled mode rejected; build clean.

## Phase 5 — Authorization engine (catalog + L1–L4 resolver)

**Objective:** The 4-layer model (Dossier Part F.5) as the single computed source of effective permissions, wired into token issuance.

**Deliverables:**
- Central **catalog** (sections → pages → apis) as the single typed source; codegen/consistency check that fails the build on catalog↔types drift.
- **Resolver:** `effective(user) → { [projectId]: {pages, apis} }` computing `(L2 ∩ L3) − L4` gated by L1, for every project the user has; called at login + refresh (replaces the Phase 4 stub).
- Claims-driven **permission guard** for papi-authority's own CRUD API (default-deny; `@Roles`-style decorator per skeleton conventions).
- Unit tests covering: L1 fail → no entry; missing entitlement blocks all users of a project; role grants; override subtracts for one (user, project); default-deny with no metadata.

**Exit criteria:** resolver unit tests green; issued tokens now carry real computed maps; drift check demonstrably fails when catalog and types are made inconsistent; build clean.

## Phase 6 — SSO + onboarding/invitations + join page

**Objective:** Azure SSO (per-panel DB config) and the complete invite pipeline with the standalone join page.

**Deliverables:**
- `src/api/sso/`: `POST /sso/login` — verifies the Azure token via `jwks-rsa` against the **single platform app registration** (Part 0.9): effective tenant/client = panel override → else `platform_settings` default; validates `iss`/`tid`/`aud`/signature/`exp` + `oid`/email match; rejects if panel SSO disabled; onboarding per `ONBOARDING_MODE` (`invite_only`: uninvited → rejected, nothing created; `open_sso`: accepted invitation auto-created, no users row); issues papi-authority tokens for approved active users.
- Documented Azure setup checklist (for when real values exist, from Part 0.9): single-tenant app, assignment required, SPA auth-code + PKCE only, exact HTTPS redirect URIs (all panel domains + join page), Conditional Access MFA policy.
- `src/api/invitations/`: `POST /invitations` (guarded, admin; pre-assign panels/projects/role; ACS email — env-placeholder connection, sandbox/log transport in dev), `GET /invitations/:token` (validate), `POST /invitations/:token/accept` (Azure-join **or** set-password path → marks the invitation `accepted` with captured `oid`/password-hash/profile; **no `users` row — Part 0.8**; single-use token, expiry).
- **NO join page is built (Dossier 0.19).** The invitation screen lives on its own subdomain and will be authored by the user later. This phase ships the invitation **API only**, plus: the invitation subdomain added to the **CORS allow-list** (the page is cross-origin to the API), and a written **endpoint contract** (request/response shapes, token semantics, error codes) for the future front-end to build against.
- **Azure path only (Dossier 0.18).** There is no "set your password" path through invitations. Password-mode users are created directly by an access-control admin via the identity CRUD API (Phase 7).

**Exit criteria:** invite→accept flow works in dev on the **Azure path** (to the verification boundary with placeholder config), ending in an `accepted` invitation and **no `users` row**; uninvited SSO rejected under `invite_only` (creates nothing) and creates an accepted invitation under `open_sso`; CORS allows the invitation subdomain and rejects others; endpoint contract documented; build clean.

## Phase 7 — Identity CRUD API

**Objective:** The guarded, audited management API the access-control console will consume later.

**Deliverables:**
- CRUD modules per skeleton conventions: `users` (+ activation, role/project/panel grants), `user-roles`, `projects` (+ nested limits/operators/op-types/blockers), `admin-panels` (**including per-panel auth config** — auth-mode toggles + SSO tenant/client), `project-entitlements` (L2), `user-project-permissions` (L4 overrides).
- All routes behind the Phase 5 default-deny guard with papi-authority's own permission sections; pagination per skeleton pattern; DTO validation (`whitelist`, `forbidNonWhitelisted`). **This module uses the console DataSource** (Dossier Part G note) — the only code path with write access to identity tables.
- **Invitation approval/rejection endpoints** (Part 0.8): approval creates the `users` row + panel/project/role grants **in one transaction** — the only code path that creates identities; rejection/expiry closes the invitation with an audit trail.
- "Unauthorize user" primitive: deactivate + revoke all refresh families (the ≤TTL kill switch from Dossier Part I).

**Exit criteria:** every entity manageable via API by a permitted admin and denied to a non-permitted user; permission changes reflected in tokens at next refresh; unauthorize-user cuts access within one TTL; build clean.

## Phase 8 — Audit + hardening baseline

**Objective:** Full auth audit trail and the production hardening sweep.

**Deliverables:**
- `src/api/audit/`: interceptor/service writing `auth_audit_events` for every auth-relevant action (login success/fail, lockout, refresh, reuse-detection, revocation, invitation lifecycle, SSO events, CRUD on identity) with raw IP, **geo-IP enrichment** (env-gated provider), device/user-agent, outcome, `jti`; query API (guarded) for the future console.
- Hardening: Helmet; CORS allow-list (no `*`); per-route tuning of the Phase 1 throttler baseline on all public auth routes; body-size limits; request-correlation IDs; structured logging with **PII/secret redaction**; TLS to DB; graceful shutdown/SIGTERM + `/ready` draining (papi-back pattern, re-implemented); security response headers on the join page re-verified.

**Exit criteria:** every Part M audit assertion demonstrable; hardening checklist verified item-by-item (headers, CORS reject, throttle 429, redacted logs); build clean.

## Phase 9 — Handover + Part M reconciliation (verification SPLIT OUT)

**Scope changed 2026-08-06 by user directive (decision 0.57):** full end-to-end
testing and verification happen **after the platform owner's review**, and will be
carried out by **dedicated testing/QA agents**, not in an implementation session.
Phase 9 therefore covers only the two deliverables that are not verification.

**Delivered:**
- **Part M reconciled** (0.58). Three assertions were written before the decisions that
  superseded them and are now amended in place, each naming its successor. The most
  consequential: "authority DB user has zero write grants on identity tables — no column
  exceptions" contradicted 0.20/0.23/0.45 and, if "fixed" to match, would break every
  password change on a platform with no forgot-password flow.
- **DB Handover Package (0.26)** in `papi-authority/docs/db-handover/`, produced by
  `npm run handover:generate` — re-runnable in one command after any review change:
  - `01-schema.sql` — `mysqldump --no-data` of a migrated DB. Generated from what MySQL
    *actually has*, not what TypeORM intended: it captures the generated `deleted_marker`
    column and the `platform_settings` CHECK constraint that TypeORM's MySQL driver
    silently drops from `@Check()`.
  - `02-principals-and-grants.sql` — verbatim `docker/mysql/grants.sql`.
  - `03-verification.sql` — hand-authored forbidden-statement acceptance checks per
    principal, with expected error codes, for the DB team to run against *their* database.
  - `README.md` — the three principals and the rationale, why the authority principal has
    column-level `UPDATE` (and must not be "tightened"), why two column grants need a
    matching `SELECT`, identity vs auth-runtime, TLS, order of operations.
  - `facts.json` — 24 tables (22 domain + `migrations` + `typeorm_metadata`), 24 FKs,
    61 indexes, 41 permissions, 3 migrations.

## Phase 10 (NEW) — Formal verification, after review

**Blocked on:** the platform owner's review of the whole service and any changes arising.

- Run the reconciled Part M in full and write the report mapping every bullet to evidence.
- Build the QA/testing agents that own flow verification from then on.
- Regenerate the handover package if the schema moved during review.

**Nothing in Phases 1–8 should be described as "formally verified"** — those were
build-time smoke checks. The formal pass is outstanding.

---

## Later phases (explicitly OUT of v1 — do not start)

Retargeting access-control as the console; fork-side guard swap (rmp first); deleting fork frontend `users` blocks; numeric→UUID fork data migration; richer admin UI. See Dossier A.3.
