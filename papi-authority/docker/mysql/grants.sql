-- =============================================================================
-- papi-authority — DB principal grants
--
-- This file is the AUTHORITATIVE grant definition and the core of the Phase 9
-- handover package (dossier 0.26). Real environments are provisioned by the DB
-- team from this; locally it is applied by `npm run db:grants`.
--
-- It must be run as a principal holding GRANT OPTION (root locally). It is
-- deliberately NOT a TypeORM migration: `papi_migrator` holds ALL PRIVILEGES
-- but NOT GRANT OPTION, so it cannot issue GRANT — and it should not be able
-- to widen its own or anyone else's access.
--
-- Idempotent: every principal is stripped to zero privileges first, so this
-- file is the complete and only description of who may do what.
--
-- -----------------------------------------------------------------------------
-- WHY THREE PRINCIPALS
--
--   papi_migrator   DDL only. Used by `npm run migration:*` and, in real
--                   environments, by the DB team. Neither runtime principal
--                   holds ALTER/DROP, so a compromised service cannot reshape
--                   the schema — it cannot drop a NOT NULL, remove a foreign
--                   key, or widen a column.
--
--   papi_authority  The auth engine. Reads identity, writes auth-runtime.
--                   It can NEVER create or delete a user, and can never touch
--                   is_active, oid, or any role/project/panel grant — so a
--                   compromised auth engine cannot escalate privileges through
--                   the database.  (0.10, 0.20, 0.23)
--
--   papi_console    access-control. The ONLY principal that creates identities.
--                   Its auth-runtime access is operation-scoped: it can approve
--                   invitations, revoke sessions, reset 2FA and clear lockouts,
--                   but can NEVER insert or alter a refresh-token hash, plant a
--                   2FA secret, or EDIT OR ERASE the audit trail (it may only
--                   append to it) — so a fully compromised console cannot forge
--                   a session or cover its tracks.  (B.3, 0.25, 0.44)
-- =============================================================================

-- Strip everything first. `REVOKE ALL PRIVILEGES, GRANT OPTION` also clears
-- table- and column-level grants, which a database-scoped REVOKE would leave
-- behind — including Phase 1's temporary blanket SELECT, which MUST NOT
-- survive (it was only ever there so the service could boot before any table
-- existed, and it would otherwise leave both principals able to read every
-- identity AND auth-runtime table).
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'papi_authority'@'%';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'papi_console'@'%';

-- =============================================================================
-- papi_migrator — DDL only
-- =============================================================================
GRANT ALL PRIVILEGES ON `papi_authority`.* TO 'papi_migrator'@'%';

-- =============================================================================
-- papi_authority — SELECT on identity, CRUD on auth-runtime
-- =============================================================================

-- Identity: read-only.
GRANT SELECT ON `papi_authority`.`users`                      TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`user_roles`                 TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`role_permissions`           TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`projects`                   TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`project_limits`             TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`project_operators`          TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`project_operator_op_types`  TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`project_blockers`           TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`admin_panels`               TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`platform_settings`          TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`permission_catalog`         TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`project_entitlements`       TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`user_project_permissions`   TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`user_projects`              TO 'papi_authority'@'%';
GRANT SELECT ON `papi_authority`.`user_admin_panels`          TO 'papi_authority'@'%';

-- The ONLY write the auth engine has on an identity table: self-service
-- profile and password changes (0.20, 0.23). Column-level by design —
-- `is_active`, `oid`, `role_id` and every grant table stay unreachable, so this
-- write can change what a user looks like but never what they may do.
--
-- `updated_at` is included for a mechanical reason, not a privilege one:
-- TypeORM writes the @UpdateDateColumn on every UPDATE it emits, so without it
-- even a granted column change fails with ERROR 1142 (verified). It is a
-- bookkeeping timestamp and confers nothing.
GRANT UPDATE (
    `first_name`, `last_name`, `phone`, `language`, `timezone`,
    `password`, `is_sp_reset`, `sp_updated_at`, `updated_at`
) ON `papi_authority`.`users` TO 'papi_authority'@'%';

-- Auth-runtime: full CRUD.
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`refresh_tokens`          TO 'papi_authority'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`invitations`             TO 'papi_authority'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`invitation_projects`     TO 'papi_authority'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`invitation_admin_panels` TO 'papi_authority'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`login_lockouts`          TO 'papi_authority'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`two_factor_state`        TO 'papi_authority'@'%';

-- Audit: INSERT and SELECT, but deliberately NO UPDATE and NO DELETE. Even the
-- service that writes the trail must not be able to alter or erase it.
GRANT SELECT, INSERT ON `papi_authority`.`auth_audit_events` TO 'papi_authority'@'%';

-- =============================================================================
-- papi_console — CRUD on identity, operation-scoped on auth-runtime
-- =============================================================================

-- Identity: full CRUD. This is the only principal that creates identities.
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`users`                     TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`user_roles`                TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`role_permissions`          TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`projects`                  TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`project_limits`            TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`project_operators`         TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`project_operator_op_types` TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`project_blockers`          TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`admin_panels`              TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`platform_settings`         TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`project_entitlements`      TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`user_project_permissions`  TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`user_projects`             TO 'papi_console'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `papi_authority`.`user_admin_panels`         TO 'papi_console'@'%';

-- The permission catalog is owned by code (0.30) and seeded by migration /
-- codegen, so the console reads it but never writes it. An entitlement can only
-- ever reference a permission the application actually defines.
GRANT SELECT ON `papi_authority`.`permission_catalog` TO 'papi_console'@'%';

-- Auth-runtime: operation-scoped only (0.25).

-- Approve an invitation: read the captured data, then delete the row (0.24).
GRANT SELECT, DELETE ON `papi_authority`.`invitations`             TO 'papi_console'@'%';
GRANT SELECT, DELETE ON `papi_authority`.`invitation_projects`     TO 'papi_console'@'%';
GRANT SELECT, DELETE ON `papi_authority`.`invitation_admin_panels` TO 'papi_console'@'%';

-- "Unauthorize user": mark sessions revoked. COLUMN-LEVEL — the console can set
-- revoked_at but can never write `token_hash`, so it cannot mint a session for
-- an existing account. This single restriction is what stops a compromised
-- console from silently impersonating a super-admin.
GRANT UPDATE (`revoked_at`, `revoked_reason`) ON `papi_authority`.`refresh_tokens` TO 'papi_console'@'%';

-- ...and the matching COLUMN-LEVEL SELECT, for the same MySQL reason as
-- `two_factor_state` below: revocation is
--   UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
-- and MySQL requires read access on every column named in a WHERE clause, so
-- UPDATE alone fails with ERROR 1143 (verified).
--
-- Granted on `user_id` and `revoked_at` ONLY. `token_hash` is deliberately NOT
-- readable: if the console could read hashes it could not forge a token (they
-- are SHA-256 of 48 random bytes), but it also has no reason to see them, and
-- the narrower grant keeps the "console never touches session secrets" property
-- true for reads as well as writes.
GRANT SELECT (`user_id`, `revoked_at`) ON `papi_authority`.`refresh_tokens` TO 'papi_console'@'%';

-- Reset a lost-device 2FA enrollment.
--
-- NOTE the SELECT: MySQL requires read access on every column named in a WHERE
-- clause, so `DELETE ... WHERE user_id = ?` fails with ERROR 1143 given DELETE
-- alone (verified). It is granted COLUMN-LEVEL on `user_id` only, so the
-- console can target the row it wants to clear but can never read
-- `secret_encrypted` — even though that value is encrypted and the console
-- holds no key.
GRANT SELECT (`user_id`), DELETE ON `papi_authority`.`two_factor_state` TO 'papi_console'@'%';

-- Clear a lockout. Same WHERE-clause requirement; full SELECT is fine here
-- because the table holds no secret material and the console UI legitimately
-- shows whether an account is locked.
GRANT SELECT, DELETE ON `papi_authority`.`login_lockouts` TO 'papi_console'@'%';

-- Read the whole audit trail for the console's query API, and APPEND to it —
-- INSERT only, never UPDATE or DELETE (0.44).
--
-- The console must be able to log its own actions inside the transaction that
-- performs them: invitation approval creates the user, applies the grants,
-- writes the audit event and deletes the invitation as one atomic unit (0.24),
-- and a cross-connection audit write cannot participate in that transaction.
--
-- The property that matters is APPEND-ONLY, and it is fully preserved: the
-- console can add to the record but can never edit or erase a single row of it,
-- including its own. Withholding INSERT would not make the console less
-- powerful over identity — it already has total authority there — it would only
-- force approvals to be logged non-atomically, which risks a durable audit
-- event for a user that was never created.
GRANT SELECT, INSERT ON `papi_authority`.`auth_audit_events` TO 'papi_console'@'%';

FLUSH PRIVILEGES;
