# Audit retention — an operations job, not a service feature

Retention for `auth_audit_events` (~6 months, dossier 0.28) is executed by the
**DB/ops team**, not by papi-authority. This document is the runbook; it is
folded into the Phase 9 handover package.

## Why the service cannot do this

Verified by execution, not by reading the grant file:

```
papi_console   -> DELETE FROM auth_audit_events : ERROR 1142 (denied)
papi_console   -> UPDATE auth_audit_events      : ERROR 1142 (denied)
papi_authority -> holds SELECT, INSERT only
```

Neither runtime principal can delete an audit row, and that is the point
(dossier 0.44, 0.54). The trail is **append-only**: both principals can add to
the record of what happened, and neither can edit or erase it — including the
record of their own actions.

MySQL has no row-level grants, so "let the service delete rows older than six
months" is not expressible. The only way to give the service pruning power is
blanket `DELETE`, which would let a compromised console erase its own tracks.
Retention is a storage concern; append-only is a security guarantee. The
guarantee wins, so pruning moves outside the service.

## The maintenance principal

Create a principal used **only** by the scheduled job — never by the
application, and never with the application's credentials:

```sql
CREATE USER 'papi_audit_maint'@'<ops-host>' IDENTIFIED BY '<managed-secret>' REQUIRE SSL;

-- SELECT is required because the DELETE filters on created_at; MySQL demands
-- read access on every column named in a WHERE clause.
GRANT SELECT (`id`, `created_at`), DELETE ON `papi_authority`.`auth_audit_events`
  TO 'papi_audit_maint'@'<ops-host>';
```

Scope the host as narrowly as your topology allows. This principal has no
access to any other table.

## The statement

Batched deliberately. `auth_audit_events` is expected to reach tens of millions
of rows, and a single unbounded `DELETE` holds locks long enough to stall
authentication — the one thing a retention job must never do.

```sql
-- Repeat until ROW_COUNT() = 0. Run off-peak.
DELETE FROM `auth_audit_events`
WHERE `created_at` < NOW() - INTERVAL 6 MONTH
ORDER BY `id`
LIMIT 10000;
```

`ORDER BY id` makes each batch delete the oldest rows first, so progress is
monotonic and an interrupted run leaves a clean boundary rather than holes.

The table carries **no inbound foreign keys** by design (see the entity
comment), which is what keeps this a cheap range delete rather than a cascade.

## Before enabling it

1. **Confirm the retention period with whoever owns the compliance
   requirement.** Six months is the working assumption from dossier 0.28, not a
   legal determination. Deleting an audit trail early is not recoverable.
2. **Archive before deleting** if any retention obligation exceeds the window —
   export via `GET /api/audit/export` (permission `audit.export`, requires an
   explicit `from`/`to`, capped at 50,000 rows per call) or dump directly from
   the database for larger ranges.
3. **Log each run** — how many rows, which date boundary, who ran it. The one
   operation permitted to remove security history should itself leave a record,
   and that record cannot live in the table being pruned.
