# papi-console — Phased Execution Plan

> Read `.claude/papi-console-plan.md` first — locked decisions (Part 0), the current-state API
> contract this proxies (Part B), target design (Part C). This file is the phase-by-phase build
> order for **`papi-console-backend`** then **`papi-console-frontend`**. Each phase needs explicit
> user approval before implementation starts (repo-wide rule, CLAUDE.md).

## CURRENT STATE — 2026-09-01

Nothing built yet. `papi-console-backend/` and `papi-console-frontend/` do not exist in this repo.
Dossier + this tech plan are the only artifacts so far (created this session, decisions 0.1–0.5
locked in `papi-console-plan.md`).

**Blocking external dependency:** decision **0.2** — `POST /api/users/:id/reset-2fa` and
`POST /api/users/:id/clear-lockout` do not exist yet in papi-authority. Backend Phase 6 (identity
actions) and frontend Phase 10 (Users screen) need them; everything before that does not. Track
that addendum in `papi-authority-tech-plan.md`, not here.

**Seed dependency:** decision **0.5** — papi-authority's dev seed must include an `admin_panels` row
for `panelKey = 'PAPI_CONSOLE'` before backend Phase 1's `/app-init` proxy can be smoke-tested
end-to-end.

---

## Global Constraints (apply to every phase, both repos)

- **From scratch**, no bulk-porting from any old-platform repo (dossier 0.3) — old
  `access-control-backend`/`access-control-frontend` isn't even checked out on this machine, and
  wouldn't be a good reference if it were (papi-authority's current API already supersedes it).
- **papi-console-backend holds no database, ever** (decision 0.1) — if a task seems to need a local
  table, that's a signal it belongs in papi-authority, not here.
- **Reuse papi-init-back's already-solved skeleton patterns directly** rather than re-deriving them:
  RFC-9457 exception filter (never construct a message from a caught error's own `.message`), the
  capped/allowlisted `PaginationQueryDto` convention, Helmet/CORS/throttle baseline, drain-window
  graceful shutdown, single-owner `/live`+`/ready`, `$/` → `src/` alias + strict tsconfig. Copy the
  actual files from `papi-init-back/src/core/` as the starting point, then adapt — don't reinvent.
- **Guard order:** Throttler → Jwt → Permission (same as every other service in this platform).
- **Frontend: permission types are generated from `GET /api/authorization/catalog`, never hand-typed**
  (decision 0.4) — this is the one deliberate improvement over every existing panel frontend, all of
  which hand-type this and have drifted at least once (papi-authority-plan.md Part F.4).
- **Per phase:** `npm run build` + `tsc --noEmit` (+ `lint --max-warnings 0` once ESLint is wired)
  must pass before a phase is declared done.
- **Never `git commit` unless the user explicitly asks.**

---

# papi-console-backend

## Phase 1 — Scaffold, config, hardening baseline (no DB, no papi-authority calls yet)

**Objective:** A booting, hardened, empty NestJS service — identical baseline to papi-init-back's
Phase 1, retargeted.

**Deliverables:**
- `papi-console-backend/` scaffolded (latest Nest CLI, versions pinned via context7 at kickoff).
- `src/configs/`: `PORT`, `NODE_ENV`, `PANEL_KEY=PAPI_CONSOLE` (decision 0.5), `PAPI_AUTHORITY_
  BASE_URL`, CORS allow-list (this is the most-privileged frontend origin — allow-list must be as
  tight as any panel's, no wildcard), throttle namespaces. Fail-fast validation.
- RFC-9457 exception filter, pagination DTO, Helmet, `ClsModule` correlation-id, drain-window
  shutdown, single-owner `/live`+`/ready` — copied from papi-init-back's Phase-1 implementation and
  adapted (see Global Constraints).
- `src/api/app-init/`: `GET /api/app-init` (`@Public()`), proxies papi-authority's
  `GET /api/app-init?panelKey=PAPI_CONSOLE`. Same fail-safe-503 rule as papi-init-back's copy.
- `papi-console-backend/CLAUDE.md`: skeleton rules, "no local identity/DB, ever — see
  papi-console-plan.md 0.1", the panel-key/JWKS env contract (fleshed out in Phase 2).
- `.env.example`.

**Exit criteria:** boots with valid env, dies loudly with invalid env; `/live`/`/ready` correct
during simulated drain; Helmet + CORS allow-list correct; `GET /api/app-init` against a running
papi-authority (with the `PAPI_CONSOLE` panel row seeded, decision 0.5) returns real config; build +
type-check clean.

## Phase 2 — JWKS verification boundary

**Objective:** Trusted, typed request context from a papi-authority access token — zero DB, zero
papi-authority calls per request (cache JWKS, same TTL/refresh pattern as papi-init-back Phase 2).

**Deliverables:** JWKS fetch/cache module, `JwtGuard` validating `iss`/`aud`/`exp`/signature,
request-scoped typed claims (`sub`, `platform:{pages,apis}`, `epoch`, `jti`).

**Exit criteria:** valid token → request context populated; expired/malformed/wrong-issuer token →
401, no papi-authority round-trip observed (verify via request log/count during test).

## Phase 3 — Auth proxy (login / refresh / logout / SSO)

**Objective:** `POST /api/auth/{login,refresh,logout}` and `POST /api/sso/login` — thin proxies to
papi-authority with `panelKey=PAPI_CONSOLE`, forwarding tokens/errors unchanged (mirrors
papi-init-back Phase 3 exactly, decision 0.5).

**Exit criteria:** end-to-end login against a running papi-authority (password mode, dev seed)
returns a real token; refresh/logout round-trip correctly; SSO path exercised if Azure dev config
is available, otherwise explicitly noted as untested and why.

## Phase 4 — Authorization guard (platform-permission scoping)

**Objective:** `@PlatformPermissions([section, action])` decorator + guard reading the token's
`platform:{pages,apis}` claim — no live DB intersection, baked-claim only (same TTL-is-the-ceiling
model as every fork, papi-authority-plan.md Part I).

**Exit criteria:** a route decorated `@PlatformPermissions(['users','view'])` 403s a token lacking
that claim entry and 200s one holding it; `@SkipPermissions()` self-resource routes unaffected.

## Phase 5 — Self-service proxy (`/users/me`)

**Objective:** Console operators are papi-authority users too (decision 0.5) — they need their own
profile/password screen. `GET`/`PATCH /api/users/me`, `POST /api/users/me/password`, proxied
unchanged to papi-authority's `MeController` (self-resource, `@SkipPermissions()`).

**Exit criteria:** an authenticated console operator can view/edit their own profile and change
their own password; cannot reach another user's `/me` (target is always the token's `sub`).

## Phase 6 — Identity-core proxy modules: Users, Invitations, User Roles

**Objective:** The bulk of the console's identity surface — proxy papi-console-plan.md Part B.1
(Users), B.5 (Invitations), B.2 (User Roles) 1:1 onto papi-authority's routes, same DTOs, same
`@PlatformPermissions` gates, response shaping only (RFC-9457 error normalization, no business
logic added or changed).

**Note:** `reset-2fa`/`clear-lockout` proxy routes are part of this phase's scope **only once
decision 0.2's papi-authority endpoints exist** — if this phase starts before that's shipped, stub
those two routes to return 501 with a clear message, and file the gap instead of blocking the rest
of the phase.

**Exit criteria:** every route in B.1/B.2/B.5 has a working proxy counterpart here; permission gates
match papi-authority's exactly (verified by a same-request 403/200 comparison against calling
papi-authority directly with the same token, for every route); invitation approval's atomicity
(papi-authority-plan.md 0.44) is untouched — this is a pure passthrough, no client-side transaction
logic re-implemented here.

## Phase 7 — Platform-config + audit proxy modules: Admin Panels, Platform Settings, Entitlements, Projects, Audit

**Objective:** Proxy papi-console-plan.md Part B.3 (Admin Panels), B.4 (Platform Settings), B.6
(Entitlements), B.7 (Audit), B.8 (Projects) — same pattern as Phase 6.

**Exit criteria:** same shape as Phase 6's, plus: `audit.export`'s CSV passthrough preserves
papi-authority's row cap and content-type unchanged (no re-buffering that could alter the cap);
`entitlements` PUT routes correctly surface the "revokes sessions" side effect in the response so
the frontend can warn the operator before they submit (UX decision, not enforced at this layer).

## Phase 8 — Hardening sweep + handover

**Objective:** Same audit as papi-init-back Phase 7 — full logging audit (no request/response
bodies, no tokens, no PII beyond what papi-authority's own audit trail already covers), throttle
bucket correctness (this service should NOT put admin CRUD behind `@AuthThrottle()` — that bucket
is for credential-verification attempts, not authenticated admin actions; only `auth`/`sso`
endpoints and this service's own login/refresh get it, per the exact bug papi-authority-plan.md
0.65 found and fixed — do not reintroduce it here), env-contract audit (`CLAUDE.md` table vs
`.env.example` vs `env.schema.ts`), final `papi-console-backend/CLAUDE.md` feature-complete section.

**Exit criteria:** `npm run build`/`typecheck`/`lint --max-warnings 0`/`test` all clean; hardening
checklist confirmed item-by-item by reading code (not assumed from Phase 1's design).

---

# papi-console-frontend

## Phase 9 — Scaffold, auth wiring, permission-type generation

**Objective:** A booting React app that can log an operator in and knows what they're allowed to
see — before any actual admin screen exists.

**Deliverables:**
- Scaffold with the pinned stack (decision 0.4: React 19, Vite 7, Redux Toolkit/RTK Query,
  Ant Design v5 — pin exact versions via context7 at kickoff, don't trust the dossier's version
  claim as current).
- Login page (password + SSO per `/app-init`'s resolved config, same UX contract every panel's
  login page follows).
- `redux/api/index.api.ts`: `prepareHeaders` (`Authorization: Bearer`), 401 → refresh-then-retry
  or redirect-to-login, matching the documented platform pattern (papi-authority-plan.md Part K) —
  since that pattern is unverified against real source (decision 0.4's accepted risk), implement it
  from papi-console-backend's actual `/api/auth/refresh` contract directly rather than guessing at
  undocumented details.
- `router/ProtectedRoutes.tsx` — route guard.
- **Permission-type generation**: a build-time (or app-boot) step that fetches
  `GET /api/authorization/catalog` and generates the TS types/constants the rest of the app imports
  — never a hand-maintained enum (decision 0.4's core deliberate improvement).
- `useCheckPermission` hook + `hasPermission(perms, section, action)` util, same call shape as the
  documented platform convention, built against the generated catalog types.

**Exit criteria:** log in as a seeded dev user against a running papi-console-backend → token
stored, protected route reachable; log out → redirected to login, protected route unreachable;
generated permission types visibly reflect a real catalog entry (spot-check one section/action
against papi-authority's actual `PERMISSION_CATALOG` source).

## Phase 10 — Pending invitations + Users screen

**Deliverables:** invitation list + approve (inline role/grant assignment) + reject; users list
(search/filter/paginate per B.1's `UserQueryDto`), create, edit profile, edit access, activate/
deactivate, set temp password, unauthorize, delete, reset-2FA/clear-lockout (or a visibly-disabled
"coming soon" state if backend Phase 6 shipped ahead of papi-authority's decision-0.2 endpoints).

**Exit criteria:** full create → invite-approve-equivalent → edit → deactivate → delete lifecycle
exercised against a running stack; every action button gated by its real permission (verified by
logging in as a role missing that permission and confirming the button/action is unavailable, not
just visually hidden — i.e. the backend 403 is the real gate, frontend hiding is UX only).

## Phase 11 — Roles & permissions screen

**Deliverables:** role list/create/edit, permission picker sourced from the generated catalog
(B.2/B.6's `GET /authorization/catalog`), full-replacement semantics surfaced clearly in the UI
(editing a role's permissions is a replace, not a patch — and revokes every holder's sessions;
the UI must warn before submit, per the same principle as Phase 7's entitlements note).

**Exit criteria:** creating a role, assigning it to a user (via the Users screen), and confirming
the granted permission actually gates a real console action end-to-end.

## Phase 12 — Admin panels + platform settings screens

**Deliverables:** admin-panel list/create/edit/delete, per-panel auth-mode + SSO override form
(separate permission `adminPanels.configureAuth`); platform-settings singleton form.

**Exit criteria:** toggling a panel's `basicAuthEnabled`/`ssoAuthEnabled` here is observably
reflected in that panel's own `/app-init` response (cross-service smoke check, not just a console-
side round-trip).

## Phase 13 — Projects screen (+ limits/operators/op-types/blockers) + Entitlements editors

**Deliverables:** projects CRUD, nested limits/operators/op-types/blockers editors; L2 project-
ceiling entitlement editor (reached from a project's detail view) and L4 per-user override editor
(reached from a user's detail view) — per dossier Part C.2's note, confirm this nesting in the UX
pass at the start of this phase rather than assuming it.

**Exit criteria:** full CRUD lifecycle for a project including nested collections; an entitlement
change is observable in a subsequent token's claims (requires a live re-login/refresh to see the
effect, per the TTL-based propagation model — document this latency to the operator in the UI
rather than implying instant effect).

## Phase 14 — Audit log screen

**Deliverables:** filterable/paginated audit table (B.7), CSV export button gated by the separate
`audit.export` permission.

**Exit criteria:** filtering by a known seeded event (e.g. a login from Phase 9's smoke test)
returns it with full IP/UA/geo detail; export produces a CSV capped at papi-authority's configured
row limit; a user with `audit.view` but not `audit.export` sees the table but not the export button
*and* a direct API call to export still 403s (frontend hiding is not the enforcement).

## Phase 15 — Hardening sweep + handover

**Objective:** Same spirit as backend Phase 8, frontend-appropriate: no token/PII in `localStorage`
beyond what's necessary (document exactly what's stored and why, matching or deliberately diverging
from the documented-but-unverified platform pattern per decision 0.4), error boundary + generic
error UI (never surface a raw backend error body to the operator), accessibility pass (this is an
admin tool used daily — keyboard nav and focus management matter more here than on a public page),
final `papi-console-frontend/CLAUDE.md`.

**Exit criteria:** manual smoke pass through every screen built in Phases 10–14 against a real
running stack (papi-authority + papi-console-backend + this frontend); build clean; no console
errors/warnings on any screen in a clean browser session.

---

## Later phases (explicitly OUT of v1 — do not start)

- Audit retention/purge UI — papi-authority hasn't built the server-side job yet
  (papi-authority-plan.md 0.28).
- Any bespoke per-panel business config beyond auth-mode/SSO — not part of papi-console's mandate.
- Migrating rmp-frontend's (or any fork's) own hand-typed permission enum onto papi-console's
  generated-catalog pattern — worth doing eventually (it would close the exact drift bug documented
  in papi-authority-plan.md Part F.4), but it's a change to *those* repos, not this one; raise as a
  separate task when a fork frontend is next touched.
