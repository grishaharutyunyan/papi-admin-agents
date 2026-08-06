# papi-authority — DB Handover Package

For the DB team, who provision and operate the real databases (dossier 0.26).
papi-authority never creates a schema: `synchronize` is hard-coded `false` with
no environment override, in every environment.

> **Regenerate, never edit.** `01-schema.sql` and `02-principals-and-grants.sql`
> are produced by `npm run handover:generate` from a fully migrated database and
> from `docker/mysql/grants.sql`. Hand-patching them guarantees the production
> database diverges from the one the service was built against.

## Contents

| File | What it is | Source |
|---|---|---|
| `01-schema.sql` | Complete DDL, no data | `mysqldump --no-data` of a migrated DB |
| `02-principals-and-grants.sql` | The three principals and every grant | verbatim `docker/mysql/grants.sql` |
| `03-verification.sql` | Statements that MUST be refused, per principal | hand-authored, run after provisioning |
| `facts.json` | Object counts + applied migrations, for cross-checking | live `information_schema` |

Current contents: **24 tables, 24 foreign keys, 61 indexes, 41 permission rows,
3 migrations.** Two of the 24 tables — `migrations` and `typeorm_metadata` — are
TypeORM bookkeeping, not domain tables; they must exist but hold no application
data.

## Server requirements

- **MySQL 8.4 LTS.** Not 9.x, which is the innovation line.
- **`utf8mb4` / `utf8mb4_0900_ai_ci`.** The collation is load-bearing: username
  and email matching at login relies on it being accent- and case-insensitive.
- **TLS required for every application connection.** The service sets
  `ssl.rejectUnauthorized = true` when `DB_SSL=1`; please issue certificates the
  service can validate rather than expecting it to be disabled.
- Time zone handling: every timestamp column is `datetime(6)`, never MySQL
  `TIMESTAMP` — `TIMESTAMP` has a 2038 ceiling and converts on read/write using
  the session time zone, which is unacceptable for security-critical instants.

## The three principals, and why there are three

One database, three least-privilege accounts. **The grants are the security
control, not the application code.**

| Principal | Used by | May do | Must never do |
|---|---|---|---|
| `papi_migrator` | `npm run migration:*` only | DDL on this schema | be used by the running service |
| `papi_authority` | the auth engine | `SELECT` identity; column-level `UPDATE` on self-service profile + password fields; full CRUD on auth-runtime | `INSERT`/`DELETE` a user; write `is_active`, `oid`, or any role/project/panel grant |
| `papi_console` | access-control | full CRUD on identity — the only path that creates identities; operation-scoped auth-runtime access; **append** to the audit trail | `INSERT`/`UPDATE` a refresh-token hash, plant a 2FA secret, or **`UPDATE`/`DELETE`** an audit row |

The two properties this buys, stated plainly:

- **A fully compromised access-control console cannot forge a session.** It can
  revoke sessions (`UPDATE (revoked_at, revoked_reason)`) but cannot write
  `token_hash`, so it cannot mint a refresh token for an existing account and
  impersonate them silently. *(Residual risk, accepted: it can create a new
  privileged identity and log in as that. The control prevents silent
  impersonation of an existing person, not all abuse.)*
- **A fully compromised auth engine cannot escalate privilege.** It holds no
  `INSERT`/`DELETE` on `users` and no write access to `is_active`, `oid`, or any
  grant column — so no defect in token issuance, password handling or SSO can
  turn into a role change.

### Why `papi_authority` has *some* write access to `users`

It holds column-level `UPDATE` on exactly:

```
first_name, last_name, phone, language, timezone,
password, is_sp_reset, sp_updated_at, updated_at
```

This is the self-service path — a user changing their own profile or password
via `/api/users/me`, which the admin panels proxy to (dossier 0.20/0.23/0.45).
`updated_at` is in the list for a mechanical reason only: TypeORM writes the
update timestamp on every `UPDATE` it emits, so without it even a permitted
column change fails with ERROR 1142.

An earlier draft of the design (0.10) called for *zero* column exceptions;
decisions 0.20/0.23/0.45 superseded it. **Please do not "tighten" this back** —
removing these columns breaks every password change on the platform, and the
platform has no forgot-password flow to fall back on.

### Column-level grants need matching `SELECT`

Two grants look over-broad and are not:

- `SELECT (user_id, revoked_at)` on `refresh_tokens` — MySQL requires read
  access on every column named in a `WHERE` clause, so revocation
  (`UPDATE … WHERE user_id = ? AND revoked_at IS NULL`) fails with **ERROR 1143**
  without it. `token_hash` remains unreadable.
- `SELECT (user_id)` on `two_factor_state` — same reason, for clearing a lost
  device. `secret_encrypted` remains unreadable.

## Identity vs auth-runtime

The schema is split into two groups (dossier 0.10):

- **Identity** — `users`, `user_roles`, `role_permissions`, `projects` and its
  children, `admin_panels`, `platform_settings`, `permission_catalog`,
  `project_entitlements`, `user_project_permissions`, `user_projects`,
  `user_admin_panels`.
- **Auth-runtime** — `refresh_tokens`, `invitations` (+ its two join tables),
  `login_lockouts`, `two_factor_state`, `auth_audit_events`.

Mutable security state deliberately lives in auth-runtime rather than on
`users`: lockout counters in `login_lockouts`, all 2FA material in
`two_factor_state`. That is what keeps `users` almost entirely read-only for the
auth engine.

## `auth_audit_events` — append-only

Neither runtime principal can `UPDATE` or `DELETE` a row in this table. Both can
`INSERT`. This is intentional and is the single most important property in the
package: both services can add to the record of what happened, and neither can
edit or erase it, including the record of their own actions.

**Retention is therefore an operations job, not a service feature.** See
`../audit-retention-runbook.md` for the separate maintenance principal, the
batched delete statement, and the reasons. Please do not grant `DELETE` on this
table to `papi_authority` or `papi_console` to make retention easier.

## Order of operations

1. Create the schema — apply `01-schema.sql`, **or** (preferred) let
   `npm run migration:run` apply the three migrations as `papi_migrator`, which
   also seeds `permission_catalog` and the single `platform_settings` row.
   `01-schema.sql` is the reference for review; the migrations are the mechanism.
2. Create the principals and grants — `02-principals-and-grants.sql`. It opens
   with `REVOKE ALL PRIVILEGES, GRANT OPTION` on both runtime accounts, so it is
   safe to re-run and cannot leave a stale grant behind. **Replace the example
   passwords with managed secrets** and narrow the host patterns from `'%'` to
   your network.
3. Run `03-verification.sql` and confirm every statement in it is **refused**.

## Note on verification status

The forbidden-statement checks in `03-verification.sql` are the ones to run
against the database you provision. They have been exercised against the local
Docker rehearsal during development, but the platform's **formal end-to-end
verification pass has not yet been run** — it takes place after the platform
owner's review (dossier 0.57). Treat this package as the intended target state,
and re-request a regenerated copy if the schema changes during review.
