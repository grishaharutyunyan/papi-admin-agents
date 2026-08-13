# papi-authority — service conventions

The platform's central identity + authorization authority, and the **only** service
that holds a signing key and issues tokens.

> **Read before changing anything:** `../.claude/papi-authority-plan.md` (the dossier — Part 0
> holds every locked decision) and `../.claude/papi-authority-tech-plan.md` (the phased plan).
> Decisions are referenced below as "dossier 0.x".

## Vocabulary

**papi-authority** (this service) · **access-control** (the management console, later phase) ·
**admin panels** (rmp, cms, dmp, btms, mmp, nh-admin — forked from papi-init-back/papi-init-front).
The shorthand "papi-core" is **banned**: it reads as "the skeleton the panels fork from", which is
the opposite of what this service is (dossier 0.21).

## The reference monorepo is READ-ONLY

`/Users/rafayelmovsesyan/Desktop/nrg/platform-admin` is a knowledge base, never a target. Study it,
port vetted pieces from it after security review, **never modify it** (dossier 0.3).

**papi-back is the pattern source, not the security ceiling.** It has verified defects — spoofable
client IPs, a public `/metrics`, dead Key Vault code, non-strict TypeScript, a broken build layout.
They are catalogued in dossier **D.3b**. Read that before copying anything.

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | watch mode |
| `npm run build` | `nest build` (prebuild wipes `dist`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm run migration:*` | builds first, then runs the CLI against `dist/` |
| `docker compose up -d` | local MySQL + the three DB principals |

Local setup: `cp .env.example .env` → fill it → `docker compose up -d` → `npm run start:dev`.

## Conventions

- **Path alias `$/` → `src/`.** Use it everywhere; relative paths only for local siblings.
  Declared via `paths` **without `baseUrl`** — `baseUrl` is deprecated in TS 6 and removed in TS 7,
  and it also lets bare `src/...` imports resolve, which silently bypasses the convention
  (dossier 0.16).
- **`$/` is rewritten by the Nest CLI at emit**, not by `tsc`. `nest build` output resolves at
  runtime; plain `tsc` output dies with `Cannot find module '$/app.module'`. Any non-Nest entrypoint
  must therefore run against compiled `dist/` output — which is exactly what the `migration:*`
  scripts do.
- **Never read `process.env` outside `src/configs/**`.** This is enforced mechanically by an ESLint
  `no-restricted-properties` rule, not merely documented — papi-back documents it and violates it in
  five files. Inject `ConfigService`, or the typed `ConfigType<typeof xConfig>`.
- **Config is typed.** Every namespace uses `registerAs`, so consumers inject
  `ConfigType<typeof coreConfig>` — no `configService.get<T>()` casts (dossier 0.14).
- **Config validation is class-validator** against `EnvironmentVariables` in `src/configs/env.schema.ts`.
  Add a variable there, to `.env.example`, and to the relevant `*.config.ts` factory. Boolean env
  vars use the explicit `toBoolean` transformer — never implicit conversion, because
  `Boolean('false')` is `true`.
- **Routes are `/api/<domain>/...`** via `setGlobalPrefix('api')`. **No URI versioning** (dossier
  0.17). `/live` and `/ready` are deliberately excluded from the prefix for infra probes.
- **Module layout per domain:** `<domain>.module.ts` + `controllers/` + `services/` + `dto/` +
  `entities/`. Mount domain modules in `src/api/api.module.ts` — we do **not** use papi-back's
  `RouterModule` triple-listing, where omitting a module from one of three lists silently drops its
  prefix.
- **Entities (from Phase 2):** register in `TypeOrmModule.forFeature([...], <DataSourceName>)`
  **and** in the matching `entities[]` in `src/configs/database.config.ts` **and** in
  `src/typeorm-cli-data-source.ts`.
- **`incremental` stays off.** With nest-cli's `deleteOutDir`, a stale `.tsbuildinfo` produces a
  silently partial build.
- **`useDefineForClassFields: false` is pinned — do not delete it, do not "let it default"**
  (dossier 0.60). At `target: ES2022`+ it defaults to `true`, and then a PATCH DTO
  (`class UpdateUserDto { name?: string; email?: string }`) carrying only `name` arrives with
  `email` as an own `undefined` key — so `Object.assign(entity, dto)` **wipes the `email` column**.
  Verified both ways against this project's `class-transformer` and `typeorm`.
- **Language level is `ES2024` + `module: node20`** (dossier 0.59), matching the `node >= 24.11.0`
  floor. `moduleResolution` stays **`node16`** — the resolution algorithm is unchanged and TS 6
  rejects any other pairing with `TS5109`.
- **No logger yet.** The company-standard logging package is supplied at the final step (dossier
  0.15). Until then `no-console` is an error, and **nothing sensitive may be written to output at
  all** — no token material, password hashes, key material, or auth-path request bodies.

## The three DB principals

One database, three least-privilege accounts. The grants — not the code — are the control.

| Principal | May do | May never do |
|---|---|---|
| `papi_migrator` | DDL. Used only by `npm run migration:*` | be used by the running service |
| `papi_authority` | SELECT identity; column-level UPDATE on self-service profile/password fields; full CRUD on auth-runtime | INSERT/DELETE users; touch `is_active`, `oid`, or any role/project/panel grant column |
| `papi_console` | full CRUD on identity — the only path that creates identities; operation-scoped auth-runtime grants; **append** to the audit trail (0.44) | INSERT/UPDATE a refresh-token hash, plant a 2FA secret, or **edit/erase** an audit row |

Why it matters: a fully compromised access-control **cannot forge a session**, and a fully
compromised auth engine **cannot escalate privileges** through the database (dossier B.3, 0.20,
0.23, 0.25).

Identity entities are mapped on **both** runtime connections. That is intentional — the DB grant,
not the entity mapping, is what makes them read-only for the authority principal.

**Real databases are provisioned by a separate DB team** (dossier 0.26). `docker-compose.yml` and
`docker/mysql/init/` are the local rehearsal only. Schema changes flow through TypeORM migrations,
and the Phase 9 handover package is generated from them — never hand-written.

## Before finishing any task

1. `npm run build` — clean.
2. `npm run typecheck` — clean.
3. `npm run lint` — clean at `--max-warnings 0`.
4. Touched an entity? Verify all three registration points above.
5. Touched config? Update `.env.example` and confirm an invalid value still fails fast.
6. **Never `git commit` unless explicitly asked.**

## Deliberate divergences from papi-back

Each of these is a considered decision, not an oversight. Do not "fix" them back.

| Here | papi-back | Why |
|---|---|---|
| full `strict` + `noUncheckedIndexedAccess` | `strictNullChecks:false`, `noImplicitAny:false` | null-safety bugs live in token/permission paths |
| type-aware ESLint, `no-explicit-any` on | zero type-aware rules, `no-explicit-any` off | a floating promise in a guard is an auth bug |
| `process.env` ban enforced by lint | documented only, violated 5× | conventions without enforcement are not controls |
| `rootDir` + `include` set | neither | papi-back emits `dist/src/main.js`, breaking `start:prod` and its Docker `CMD` |
| `trust proxy` configured | absent, trusts `x-forwarded-for` | otherwise throttle keys and audit IPs are client-spoofable |
| named throttlers, tight `auth` bucket per-route | one global 100/60s bucket | credential endpoints need their own limit |
| `setGlobalPrefix` | `RouterModule` triple-listing | removes a silent prefix-loss failure mode |
| ValidationPipe without `enableImplicitConversion` | enabled | silent coercion vs `forbidNonWhitelisted` |
| one owner for `/live` + `/ready`, real 503, no error text | two owners; 200-with-503-in-body; leaks DB errors | probes must be actionable and must not disclose |
| drain window before `app.close()`, with timeout | closes immediately | otherwise draining never happens |
| no `xlsx`; `dotenv` declared explicitly | ships `xlsx` w/ advisories; phantom `dotenv` | dependency hygiene |
