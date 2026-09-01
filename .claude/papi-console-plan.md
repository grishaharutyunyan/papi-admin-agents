# papi-console — Build Plan + Discovery Dossier (v1)

> papi-console is roadmap item 2: the management/admin console over **papi-authority**. Named
> "access-control" in all papi-authority-plan.md text before 2026-08-31 (decision 0.66) — read
> "access-control" there as this project's old name. Two repos: **`papi-console-backend`**,
> **`papi-console-frontend`**.

---

# PART 0 — LOCKED DECISIONS (papi-console-specific)

Numbered independently from papi-authority-plan.md's Part 0. The rename itself (access-control →
papi-console) is decision **0.66** in `papi-authority-plan.md` and is not repeated here.

| # | Decision | Rationale |
|---|---|---|
| 0.1 | **Architecture: papi-console-backend is a stateless proxy, no DB of its own** (locked 2026-08-31) | Extends `papi-init-back-plan.md` **P.4** ("one authority, N thin consumers") to papi-console: no entities, no migrations, no DB principal, no direct connection to papi-authority's database — including the `papi_console` MySQL user, whose grants (papi-authority-plan.md 0.25/0.44/0.50) exist for **papi-authority's own internal module isolation** (its identity-CRUD module connects internally as `papi_console`, per Part G), not for an external service. Every write goes through papi-authority's guarded, validated, audited HTTP API. **Rejected alternative:** papi-console-backend holds its own `papi_console` DataSource and writes the identity tables directly — rejected because it would let a compromised console bypass papi-authority's permission guards/DTO validation/audit interceptor entirely, defeating the reason that layer exists. papi-console-backend verifies the RS256 access token locally against papi-authority's JWKS (same as every fork), same as papi-init-back's P.4(c). |
| 0.2 | **Two new papi-authority admin endpoints required before papi-console needs them** (locked 2026-08-31) | `POST /api/users/:id/reset-2fa` and `POST /api/users/:id/clear-lockout`, mirroring the existing `POST /api/users/:id/unauthorize` pattern (guard `@PlatformPermissions(['users','update'])` or a dedicated action, internal use of the already-provisioned `papi_console` DataSource). The DB grants for these (`DELETE` on `two_factor_state`/`login_lockouts`) are already live (papi-authority-plan.md §3 grants audit, 2026-08-31) but no HTTP route calls them today — confirmed by reading `papi-authority/src/api/users/` source, not assumed. This is a **papi-authority** task, logged here because papi-console-backend's identity-actions phase depends on it; track completion in `papi-authority-tech-plan.md` as a small addendum phase, not inside papi-console's own phases. |
| 0.3 | **Old `access-control-backend`/`access-control-frontend` source not required — design fresh against papi-authority's current API** (locked 2026-08-31) | Neither exists on this developer's machine (`.claude.local.md` confirms only 4 old backends checked out, no frontends at all). papi-authority's actual admin surface (Part B below) already supersedes and improves on everything access-control-backend did in the old platform (normalized role/permission rows instead of a `meta` JSON blob, RS256 instead of symmetric HS256, no per-fork remote-DB puppeteering) — porting its backend logic would be a regression, not a reference. The old dossier's Part E (papi-authority-plan.md, 2026-07-dated) is used only as loose directional inspiration for page groupings (users/roles/panels/settings), never as a source to port code from. No access-control-specific security defects are documented anywhere in this repo (distinct from papi-back's well-documented defect list, D.3b, which does not apply here). **Accepted risk:** if an old-platform access-control checkout later becomes available, re-check this decision — it was made without seeing that code. |
| 0.5 | **papi-console authenticates as its own admin panel — no special "console admin" auth path** (locked 2026-09-01) | papi-console is seeded as its own row in `admin_panels` (e.g. `panelKey = 'PAPI_CONSOLE'`), and its operators log in through the **exact same** `GET /api/app-init`, `POST /api/auth/login`, `POST /api/sso/login` flow as any forked panel — same as every other consumer of papi-authority. The resulting access token carries the standard `platform:{pages,apis}` claim (papi-authority-plan.md 0.43), computed from the operator's role permissions the same way for any user; console screens are gated by `@PlatformPermissions([section, action])` like any other platform-scoped route. **Rejected alternative:** a bespoke "console admin" token shape or a separate login path — rejected, it would duplicate the entire auth engine for no security or product benefit and contradicts "one authority" (papi-authority-plan.md Part A.2). Consequence for the tech plan: papi-console-backend's Phase 1 needs a `PANEL_KEY=PAPI_CONSOLE` env var and an `/app-init` proxy exactly like papi-init-back's, and papi-authority's dev seed data must include this panel row before papi-console-backend Phase 1 can be smoke-tested end-to-end. |
| 0.4 | **Frontend stack carried forward unverified — accepted risk** (locked 2026-08-31) | No frontend repo of any kind exists on this machine to verify against. papi-console-frontend uses the dossier-asserted platform-wide stack: **React 19 + Vite 7 + Redux Toolkit/RTK Query + Ant Design v5** (papi-authority-plan.md Part C/O.1), for consistency with every panel frontend (shared component/hook patterns, familiar to any dev who's touched a panel). AntD v5's `Table` (server-side pagination/sorting) is sufficient for this platform's CRUD screens at expected scale — no separate virtualized grid library. **Permission types are generated from `GET /api/authorization/catalog`, never hand-typed** — the dossier's Part F.4 documents `rmp-frontend`'s hand-duplicated permission enum drifting out of sync with the backend (missing 5 real actions) as a real, verified bug class; papi-console-frontend must not repeat it, and should be the reference implementation other panel frontends eventually migrate to. **Accepted risk:** if a real frontend checkout becomes available, verify the `prepareHeaders`/401-handling pattern (papi-authority-plan.md Part K) and this decision's stack claim before Phase 1 locks dependency versions. |

---

# PART A — WHY

## A.1 The problem
Every admin action against papi-authority's identity/authorization model — inviting and approving
users, assigning roles and permissions, configuring admin-panel auth modes and SSO, setting
platform-wide defaults, reviewing the audit trail, managing per-project entitlements — currently has
**no UI**. papi-authority Phase 7 built the full guarded API for all of this (Part B below); nothing
consumes it yet. Every platform operator action today would have to go through raw HTTP calls.

## A.2 The goal
A single admin console, `papi-console`, that is papi-authority's only intended caller for the admin
surface (its own controller comments already say so — `users.controller.ts`: "the surface
access-control consumes"). Thin backend (BFF/proxy, decision 0.1), full-featured frontend.

## A.3 Scope of v1
In scope: everything papi-authority's current admin API already exposes (Part B), plus the two new
endpoints from decision 0.2. Out of scope: anything not yet built in papi-authority — e.g. audit
retention/purge UI (papi-authority-plan.md 0.28, "deferred, designed for"), any admin-panel-specific
business config beyond auth mode/SSO.

---

# PART B — CURRENT-STATE FACTS (papi-authority's actual admin API, verified against source 2026-08-31)

Full detail gathered by Atlas (2026-08-31 research pass); summarized here as the contract
papi-console-backend proxies. All routes prefixed `/api`, guard chain `JwtGuard` →
`@PlatformPermissions([section, action])` unless noted `@SkipPermissions()`. papi-authority's
`PERMISSION_CATALOG` sections: `users`, `userRoles`, `projects`, `projectOperators`,
`projectLimits`, `adminPanels`, `entitlements`, `audit`, `platformSettings` — every route below has
a matching catalog entry (`GET /api/authorization/catalog` exposes the whole set for the frontend's
permission-picker/type-generation, decision 0.4).

## B.1 Users — `UsersController` (DataSource: console, internal to papi-authority)
`GET /users` (list, `users.view`) · `GET /users/:id` (`users.view`) · `POST /users` (`users.create`,
`CreateUserDto`: email/username/optional temp password/profile/roleId/projectIds/adminPanelIds —
password-mode only, no `oid`) · `PATCH /users/:id` (`users.update`, profile fields only) ·
`PUT /users/:id/access` (`users.update`, role+grants, revokes sessions) ·
`PUT /users/:id/active` (`users.update`) · `PUT /users/:id/password` (`users.update`, admin-set temp
password) · `POST /users/:id/unauthorize` (`users.unauthorize`, deactivate + revoke refresh
families) · `DELETE /users/:id` (`users.delete`, soft) · **plus decision 0.2's two new endpoints
once built.**

## B.2 User roles — `UserRolesController`
`GET /user-roles` / `GET /user-roles/:id` (`userRoles.view`) · `POST /user-roles`
(`userRoles.create`) · `PATCH /user-roles/:id` (`userRoles.update`, name/description/isPublic only)
· `PUT /user-roles/:id/permissions` (`userRoles.update`, **full replacement** of the role's L3
permission set, `PermissionRefDto[]`, revokes sessions of every holder) · `DELETE /user-roles/:id`
(`userRoles.delete`, soft).

## B.3 Admin panels — `AdminPanelsController`
`GET /admin-panels` / `GET /admin-panels/:id` (`adminPanels.view`) · `POST /admin-panels`
(`adminPanels.create`, `panelKey` immutable regex `^[A-Z0-9_]+$`) · `PATCH /admin-panels/:id`
(`adminPanels.update`) · `PUT /admin-panels/:id/auth` (**separate permission** `adminPanels.
configureAuth`: `basicAuthEnabled`/`ssoAuthEnabled`/`ssoTenantId`/`ssoClientId` nullable overrides)
· `DELETE /admin-panels/:id` (`adminPanels.delete`).

## B.4 Platform settings — `PlatformSettingsController` (singleton row)
`GET /platform-settings` (`platformSettings.view`) · `PUT /platform-settings`
(`platformSettings.update`, `ssoTenantId`/`ssoClientId` nullable — the platform default Azure app).

## B.5 Invitations — split, two controllers
Creation (`InvitationController`, on papi-authority's authority connection): `POST /invitations`
(`users.invite`) · public validate/accept for the join page (not console-facing).
Approval (`InvitationApprovalController`, console connection — **this is what papi-console calls**):
`GET /invitations/pending` (`users.approve`) · `POST /invitations/:id/approve` (`users.approve`,
one transaction: creates `users` row + grants + audit event + deletes invitation) ·
`DELETE /invitations/:id` (`users.approve`, reject — deletes row, no tombstone).

## B.6 Authorization / entitlements — `EntitlementsController`
`GET /authorization/catalog` (`entitlements.view`, the full permission catalog — power's the
frontend's role-permission picker and generated types) · `GET`/`PUT
/authorization/projects/:projectId/entitlements` (L2 project ceiling; PUT revokes every member's
sessions) · `GET`/`PUT /authorization/users/:userId/projects/:projectId/overrides` (L4, PUT guarded
by `users.update` since the subject is the user, not the project).

## B.7 Audit — `AuditController` (append-only by DB grant, not convention — no write routes exist or
ever will)
`GET /audit` (`audit.view`, full unmasked rows: IP/UA/geo/metadata, papi-authority-plan.md 0.55) ·
`GET /audit/count` (`audit.view`) · `GET /audit/export` (**separate permission** `audit.export`, CSV,
capped).

## B.8 Projects (+ limits/operators/op-types/blockers) — `ProjectsController` (console-exclusive,
platform-scoped, not project-scoped)
`GET`/`POST`/`PATCH`/`DELETE /projects[/:id]` (`projects.*`) · `PUT`/`DELETE
/projects/:id/limits[/:limitId]` (`projectLimits.*`) · `PUT`/`DELETE
/projects/:id/operators[/:operatorId]` (`projectOperators.*`) · nested op-types under operators ·
`PUT /projects/:id/blockers` (`projects.update`).

## B.9 DB-grant confirmation (informational — papi-console-backend never connects directly, 0.1)
`papi_console` grants in `papi-authority/docker/mysql/grants.sql` match decisions
0.25/0.44/0.50/0.58 exactly, byte-for-byte identical to the generated handover doc — no drift found
2026-08-31. Included here only so a future reader doesn't re-litigate decision 0.1 by rediscovering
that the grants "look like" they're meant for an external connection — they aren't; they're
papi-authority's own internal module-isolation principal.

---

# PART C — TARGET DESIGN

## C.1 papi-console-backend
Thin proxy/BFF, structurally identical to papi-init-back's pattern (config/JWKS-verify/hardening
baseline, then one proxy module per papi-authority admin domain). No local DB. Verifies RS256
access tokens locally against papi-authority's JWKS (zero papi-authority calls on the guard hot
path, same as every fork). Forwards `@PlatformPermissions` checks by relaying papi-authority's 403s
— it does not re-implement authorization logic, only forwards and shapes responses/errors
consistently (RFC-9457, per the platform-wide exception-filter pattern, papi-authority-plan.md
0.63/module-inventory Part S).

## C.2 papi-console-frontend — screens (grouped from Part B, permission-gated per screen and per
action button using generated catalog types, decision 0.4)
1. **Login** — password and/or SSO per the resolved `app-init` config (papi-authority-plan.md 0.61),
   same pattern as every panel's login page.
2. **Pending invitations** — list (B.5), approve (assign/adjust role+grants inline), reject.
3. **Users** — list/search/filter (B.1), create, edit profile, edit access (role/projects/panels),
   activate/deactivate, set temp password, unauthorize, delete, **reset 2FA / clear lockout** (once
   0.2 ships).
4. **Roles & permissions** — list/create/edit roles (B.2), permission picker sourced from
   `GET /authorization/catalog` (never hand-typed, decision 0.4).
5. **Admin panels** — list/create/edit (B.3), per-panel auth-mode + SSO override config (separate
   permission, `adminPanels.configureAuth`).
6. **Platform settings** — the single default-Azure-app form (B.4).
7. **Projects** — list/create/edit/delete (B.8), nested limits/operators/op-types/blockers editors.
8. **Entitlements** — per-project L2 ceiling editor, per-user L4 override editor (B.6) — likely
   reached from the Projects and Users screens respectively rather than as standalone top-level nav,
   to be confirmed in the frontend phase's UX pass.
9. **Audit log** — filterable table (B.7) + CSV export button (separate permission).

## C.3 What papi-console explicitly does NOT do in v1
No audit retention/purge UI (papi-authority-plan.md 0.28 — not yet built server-side). No
self-service anything (that's `/users/me`, consumed by fork panels, not this console). No
direct-DB anything (0.1).

---

# PART D — OPEN ITEMS / ACCEPTED RISKS

- Decision 0.2's two papi-authority endpoints are a **dependency**, not yet built — track in
  `papi-authority-tech-plan.md`, block papi-console-backend's users-actions phase on it (or stub the
  two UI actions as disabled/"coming soon" if the console frontend phase runs ahead of it).
- Decision 0.3's and 0.4's accepted risks (no old access-control source, no frontend checkout to
  verify the stack) stand until either becomes available — re-check both decisions if either
  checkout shows up later, per each decision's own note.
- No dedicated papi-console repo exists yet (`ls` confirms neither `papi-console-backend/` nor
  `papi-console-frontend/` in this repo as of 2026-09-01) — created at Phase 1 of the tech plan.
