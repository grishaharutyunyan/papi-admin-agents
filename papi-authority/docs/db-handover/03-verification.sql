-- =============================================================================
-- papi-authority — grant acceptance checks
--
-- Run AFTER provisioning, connecting as each principal in turn. Every statement
-- in the "MUST BE REFUSED" sections is expected to FAIL with the noted error.
-- A statement that SUCCEEDS is a provisioning defect, not a curiosity.
--
--   ERROR 1142 = command denied for the whole table
--   ERROR 1143 = command denied for a specific column
--
-- Run statement by statement; the client will stop at the first error, which is
-- the point. Nothing here writes data that survives — the permitted checks at
-- the end are reads only.
--
-- Hand-authored (unlike 01/02, which are generated). Keep it in step with
-- docker/mysql/grants.sql.
-- =============================================================================


-- =============================================================================
-- AS papi_authority  — the auth engine
-- =============================================================================

-- ---- MUST BE REFUSED: cannot create or destroy an identity ------------------

INSERT INTO `users` (`id`, `username`, `email`) VALUES (UUID(), 'mallory', 'm@x.test');
--> expect ERROR 1142 (INSERT denied for table 'users')

DELETE FROM `users` WHERE `username` = 'admin';
--> expect ERROR 1142 (DELETE denied for table 'users')

-- ---- MUST BE REFUSED: cannot escalate a privilege ---------------------------

UPDATE `users` SET `is_active` = 1 WHERE `username` = 'admin';
--> expect ERROR 1143 (UPDATE denied for column 'is_active')

UPDATE `users` SET `role_id` = NULL WHERE `username` = 'admin';
--> expect ERROR 1143 (UPDATE denied for column 'role_id')

UPDATE `users` SET `oid` = '00000000-0000-0000-0000-000000000000' WHERE `username` = 'admin';
--> expect ERROR 1143 (UPDATE denied for column 'oid')

INSERT INTO `user_projects` (`user_id`, `project_id`) VALUES ('a', 'b');
--> expect ERROR 1142 (INSERT denied for table 'user_projects')

INSERT INTO `user_admin_panels` (`user_id`, `admin_panel_id`) VALUES ('a', 'b');
--> expect ERROR 1142

INSERT INTO `role_permissions` (`role_id`, `section`, `permission_key`, `kind`)
  VALUES ('a', 'users', 'delete', 'api');
--> expect ERROR 1142

INSERT INTO `project_entitlements` (`project_id`, `section`, `permission_key`, `kind`)
  VALUES ('a', 'users', 'delete', 'api');
--> expect ERROR 1142

-- ---- MUST BE REFUSED: cannot rewrite its own audit trail --------------------

UPDATE `auth_audit_events` SET `outcome` = 'success' WHERE `outcome` = 'failure';
--> expect ERROR 1142

DELETE FROM `auth_audit_events` WHERE `id` > 0;
--> expect ERROR 1142

-- ---- MUST SUCCEED: the self-service path (0.20/0.23/0.45) -------------------
-- These are EXPECTED to work. If they fail, /api/users/me is broken and there
-- is no forgot-password flow to fall back on.

UPDATE `users`
   SET `phone` = `phone`, `language` = `language`, `password` = `password`,
       `is_sp_reset` = `is_sp_reset`, `updated_at` = NOW(6)
 WHERE `username` = 'admin';
--> expect success (self-assignment; changes nothing)

SELECT COUNT(*) FROM `users`;
--> expect success

INSERT INTO `auth_audit_events` (`event_type`, `outcome`, `created_at`)
  VALUES ('handover.verification', 'success', NOW(6));
--> expect success (the trail is append-only, not unwritable)


-- =============================================================================
-- AS papi_console  — access-control
-- =============================================================================

-- ---- MUST BE REFUSED: cannot forge a session --------------------------------

INSERT INTO `refresh_tokens` (`user_id`, `token_hash`, `family_id`, `expires_at`)
  VALUES ('a', 'forged', 'f', NOW());
--> expect ERROR 1142 (INSERT denied for table 'refresh_tokens')

UPDATE `refresh_tokens` SET `token_hash` = 'forged' WHERE `user_id` = 'a';
--> expect ERROR 1143 (UPDATE denied for column 'token_hash')

SELECT `token_hash` FROM `refresh_tokens` LIMIT 1;
--> expect ERROR 1143 (SELECT denied for column 'token_hash')

-- ---- MUST BE REFUSED: cannot plant a 2FA secret -----------------------------

INSERT INTO `two_factor_state` (`user_id`, `secret_encrypted`) VALUES ('a', 'x');
--> expect ERROR 1142

SELECT `secret_encrypted` FROM `two_factor_state` LIMIT 1;
--> expect ERROR 1143

-- ---- MUST BE REFUSED: cannot cover its tracks -------------------------------

UPDATE `auth_audit_events` SET `outcome` = 'success' WHERE `outcome` = 'denied';
--> expect ERROR 1142

DELETE FROM `auth_audit_events` WHERE `id` > 0;
--> expect ERROR 1142

-- ---- MUST SUCCEED: the console's actual job ---------------------------------

SELECT COUNT(*) FROM `users`;
--> expect success (it is the only principal that creates identities)

UPDATE `refresh_tokens`
   SET `revoked_at` = `revoked_at`, `revoked_reason` = `revoked_reason`
 WHERE `user_id` = '00000000-0000-0000-0000-000000000000' AND `revoked_at` IS NULL;
--> expect success — this is "unauthorize user". If it returns ERROR 1143, the
--> matching column-level SELECT (user_id, revoked_at) is missing.

INSERT INTO `auth_audit_events` (`event_type`, `outcome`, `created_at`)
  VALUES ('handover.verification', 'success', NOW(6));
--> expect success — approval must be able to audit inside its own transaction


-- =============================================================================
-- AS papi_migrator
-- =============================================================================

-- MUST BE REFUSED: it holds no GRANT OPTION, so it cannot widen anyone's access
-- (including its own) even though it owns the schema.
GRANT ALL PRIVILEGES ON `papi_authority`.* TO 'papi_authority'@'%';
--> expect ERROR 1045/1142 (access denied; no GRANT OPTION)


-- =============================================================================
-- Cleanup (run as an administrator)
-- =============================================================================
-- The two permitted INSERTs above leave rows behind on purpose: neither runtime
-- principal can delete them, which is itself the proof that the trail is
-- append-only.
--
--   DELETE FROM `auth_audit_events` WHERE `event_type` = 'handover.verification';
