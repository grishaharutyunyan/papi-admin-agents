#!/bin/bash
#
# Creates the three DB principals papi-authority uses.
#
# LOCAL DEVELOPMENT ONLY (dossier 0.26) — real environments are provisioned by
# the DB team from the Phase 9 handover package. Keep this file in lockstep with
# that package: it is the rehearsal, and a drift here is a drift in production.
#
# The three principals and why they are separate:
#
#   papi_migrator   DDL only. Used exclusively by `npm run migration:*`.
#                   Neither of the runtime principals holds ALTER/DROP, so a
#                   compromised service cannot reshape the schema — it cannot,
#                   for example, drop a NOT NULL or a foreign key. (dossier N4)
#
#   papi_authority  The auth engine. SELECT on identity tables + a narrow
#                   column-level UPDATE for self-service profile/password
#                   changes, and full CRUD on auth-runtime tables. It can never
#                   INSERT/DELETE a user, nor touch is_active / oid / role /
#                   project / panel grants — so it cannot escalate privileges
#                   through the database. (dossier 0.10, 0.20, 0.23)
#
#   papi_console    access-control. Full CRUD on identity tables — the only
#                   path that creates identities — plus operation-scoped
#                   auth-runtime grants (approve invitations, revoke sessions,
#                   reset 2FA, clear lockouts, read audit). It can never INSERT
#                   or UPDATE a refresh-token hash, so a fully compromised
#                   console still cannot forge a session. (dossier B.3, 0.25)
#
# NOTE ON GRANT ORDERING — verified against MySQL 8.4:
#
#   GRANT SELECT ON papi_authority.users TO ...
#   -> ERROR 1146 (42S02): Table 'papi_authority.users' doesn't exist
#
# MySQL refuses table- and column-level grants for tables that do not exist yet,
# so the real grant set CANNOT be applied here. It is applied by the Phase 2
# grants migration, which runs after the schema migration.
#
# `GRANT USAGE` is also not enough: USAGE means "no privileges", and a principal
# with only USAGE cannot even select the schema —
#   ERROR 1044 (42000): Access denied for user 'papi_authority'@'%' to database
# — so the service could not connect at all.
#
# ############################ TEMPORARY ####################################
# The two runtime principals therefore get a schema-wide SELECT below purely so
# the service is bootable before any table exists. This is WRONG as a final
# state and is LOCAL-ONLY.
#
# The Phase 2 grants migration MUST begin with
#     REVOKE ALL PRIVILEGES ON `<db>`.* FROM 'papi_authority'@'%';
#     REVOKE ALL PRIVILEGES ON `<db>`.* FROM 'papi_console'@'%';
# before applying the precise table/column grants — revoke-then-grant is also
# what makes that migration idempotent and authoritative.
#
# This temporary grant must NOT appear in the Phase 9 DB handover package.
# ###########################################################################

set -euo pipefail

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

    -- 1. DDL-only principal (migration CLI / CI).
    CREATE USER IF NOT EXISTS 'papi_migrator'@'%'
        IDENTIFIED BY '${PAPI_MIGRATOR_PASSWORD}';
    GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO 'papi_migrator'@'%';

    -- 2. Auth engine. TEMPORARY schema-wide SELECT — see the header. Replaced
    --    by precise table/column grants in the Phase 2 grants migration.
    CREATE USER IF NOT EXISTS 'papi_authority'@'%'
        IDENTIFIED BY '${PAPI_AUTHORITY_PASSWORD}';
    GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO 'papi_authority'@'%';

    -- 3. access-control console. TEMPORARY schema-wide SELECT — same as above.
    CREATE USER IF NOT EXISTS 'papi_console'@'%'
        IDENTIFIED BY '${PAPI_CONSOLE_PASSWORD}';
    GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO 'papi_console'@'%';

    FLUSH PRIVILEGES;
EOSQL

echo "papi-authority: created papi_migrator, papi_authority, papi_console on ${MYSQL_DATABASE}"
