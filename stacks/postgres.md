# PostgreSQL guide

Applies to schema, SQL and migrations for PostgreSQL 16+, in any language. Project conventions
override this. Driver-specific rules live in the language guides (e.g. `rust-tokio-postgres.md`).

## Schema design

- Constraints live in the database: `NOT NULL` by default, `CHECK`, `UNIQUE`, foreign keys with
  an explicit `ON DELETE` (`RESTRICT` unless cascading is really the business rule). Application
  validation is not a substitute.
- Identifiers are `lower_snake_case`, never quoted mixed case. Tables are named consistently
  (plural or singular, pick one per project).
- IDs: `bigint GENERATED ALWAYS AS IDENTITY`, or UUIDv7 when IDs are exposed or generated
  outside the DB (`uuidv7()` is built in from Postgres 18; earlier, generate it in the app).
  Avoid random UUIDv4 as the primary key of large, insert-heavy tables. Pick one convention.
- Types: `timestamptz` for instants (never `timestamp`), `date` for calendar dates, `text` (with
  a `CHECK (length(x) <= n)` when a limit matters), `numeric` for money (never `float`/`real`),
  `boolean` for flags, `jsonb` only for genuinely schemaless data you don't filter on often.
- Future events in local time (meetings, calendars): store the local wall time plus the IANA
  zone name, or the instant plus the zone. Offset rules change; a bare offset does not.
- Small closed sets: `CHECK (status IN (...))` or a lookup table. Native `enum` types can't drop
  or rename values easily; use them only for sets that never shrink.
- Uniqueness with soft delete or case-insensitivity uses partial or expression unique indexes:
  `CREATE UNIQUE INDEX ON members (org_id, lower(email)) WHERE deleted_at IS NULL`.
- Non-overlapping ranges (bookings, terms) use an exclusion constraint
  (`EXCLUDE USING gist (room_id WITH =, during WITH &&)`, needs `btree_gist`), not app checks.
- Audit columns (`created_at`, `updated_at`, `created_by`) where the domain needs history;
  append-only history tables for records with legal weight. Never update an issued record in place.

## Indexing

- Postgres does not index foreign keys automatically. Index every referencing column that is
  joined on or used by `ON DELETE` checks.
- Composite indexes: equality columns first, then the range or sort column. In multi-tenant
  tables the tenant column usually leads: `(org_id, starts_at)`.
- Use partial indexes for hot subsets (`WHERE deleted_at IS NULL`, `WHERE status = 'pending'`)
  and `INCLUDE (...)` for index-only scans of hot read paths.
- `jsonb` containment and full-text search use GIN. `ILIKE '%x%'` needs a `pg_trgm` GIN index
  or it scans. Expression filters (`lower(email)`) need a matching expression index.
- Each index slows writes and costs memory. Drop ones that `pg_stat_user_indexes.idx_scan`
  shows unused (check replicas too), and don't add duplicates of an existing index prefix.

## Queries

- Parameterized queries only. Dynamic identifiers (sort column, direction) come from an
  allowlist in code, never from request strings.
- Select explicit columns, not `SELECT *`.
- No N+1: fetch related rows with a join or one `WHERE id = ANY($1)` query, not one per row.
- Paginate with keyset (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC`)
  on large or growing tables. The ordering must be total (add the PK as a tiebreaker).
  `OFFSET` is acceptable for small, bounded admin lists.
- Exact `count(*)` on large tables is expensive. Don't return totals by default on big lists.
- Use `NOT EXISTS`, not `NOT IN (subquery)`: a single `NULL` makes `NOT IN` return no rows.
- Upserts and idempotent writes use a unique constraint plus `INSERT ... ON CONFLICT`. Don't
  emulate them with select-then-insert.
- Bulk writes: multi-row `INSERT`, `INSERT ... SELECT FROM unnest($1::..[], ...)`, or `COPY`.

## Transactions and locking

- Wrap multi-statement invariants in a transaction. Keep it short: no network calls, no user
  think-time, no waiting on queues inside it.
- Read-modify-write races: `SELECT ... FOR UPDATE`, a conditional `UPDATE ... WHERE version = $n`,
  or `SERIALIZABLE`. `SERIALIZABLE` and deadlocks raise `40001`/`40P01`; retry the whole
  transaction a bounded number of times.
- Lock rows in a consistent order (`ORDER BY id FOR UPDATE`) to avoid deadlocks.
- Job queues: `FOR UPDATE SKIP LOCKED` to claim work, with a status and attempt count per job.
- Set timeouts per role so mistakes fail fast:
  `ALTER ROLE app SET statement_timeout = '5s'; ALTER ROLE app SET idle_in_transaction_session_timeout = '30s';`
  Long reports or exports use a separate role or a `SET LOCAL statement_timeout`.

## Multi-tenant isolation

- Every tenant-scoped table carries the tenant column (`NOT NULL`, indexed), and every query
  filters on it. Child rows store it too, so isolation never depends on a join being present.
- Hierarchical tenancy (parent tenant -> child tenants): authorize on the set of tenant IDs the
  principal may access, resolved once per request, not by walking the tree in every query.
- Enforce isolation in the database as a second line of defense with Row-Level Security:
  ```sql
  ALTER TABLE events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE events FORCE ROW LEVEL SECURITY;  -- applies to the table owner too
  CREATE POLICY tenant_isolation ON events
    USING (org_id = ANY ((SELECT current_setting('app.org_ids', true))::uuid[]))
    WITH CHECK (org_id = ANY ((SELECT current_setting('app.org_ids', true))::uuid[]));
  ```
- Set the tenant context per transaction with `SET LOCAL` / `set_config(name, value, true)`.
  A session-level `SET` leaks to the next request that reuses the pooled connection. A missing
  context must yield no rows or an error, never all rows.
- Wrap function calls in policies in `(SELECT ...)` so they are evaluated once, not per row,
  and index the columns policies filter on.
- Superusers and roles with `BYPASSRLS` skip policies. The application role has neither.
- Views run with the owner's privileges and bypass the caller's RLS unless created
  `WITH (security_invoker = true)`. `SECURITY DEFINER` functions also bypass it; avoid them, or
  pin `SET search_path` on them and check access inside.
- Test isolation explicitly: a query as tenant A must not see, update or insert tenant B rows.

## Migrations

- Every schema change is a versioned migration file run by the migration tool in CI and on
  deploy. No manual DDL in production. Never edit a migration that has run anywhere shared.
- Forward-only in production: a fix or rollback is a new migration. Down migrations are
  optional local conveniences, not a deploy plan.
- Old and new application versions run side by side during a deploy, so each migration must
  work with the code currently running. Use expand/contract for renames, type changes and
  drops: add the new shape, write both, backfill, switch reads, stop writing the old, then drop
  it in a later release. Remove code references before dropping a column.
- Start risky DDL with `SET lock_timeout = '5s'` (and retry) so a blocked `ALTER TABLE` does not
  queue every other query behind it.
- Know what rewrites or locks the table:
  - `ADD COLUMN` with a constant default is metadata-only. A volatile default (`random()`,
    `clock_timestamp()`) rewrites the table.
  - Most column type changes rewrite the table. Widening `varchar(n)` or `varchar` to `text` doesn't.
  - `SET NOT NULL` scans under an exclusive lock. On a large table add
    `CHECK (col IS NOT NULL) NOT VALID`, `VALIDATE CONSTRAINT`, then `SET NOT NULL` (it uses the
    validated check and skips the scan), then drop the check.
  - New foreign keys and checks on existing tables: add `NOT VALID`, then `VALIDATE CONSTRAINT`
    in a separate step.
- Indexes on existing tables: `CREATE INDEX CONCURRENTLY`. It cannot run inside a transaction
  block, so it needs its own non-transactional migration. A failed build leaves an `INVALID`
  index; drop it and retry. For a new unique constraint, build the unique index concurrently,
  then `ADD CONSTRAINT ... UNIQUE USING INDEX`.
- Keep DDL and large data changes in separate migrations. Backfill in batches by key range,
  committing per batch from a script or job (not one giant transaction), idempotent so it can
  resume. Run `ANALYZE` on the table afterwards.
- CI applies all migrations to an empty database and to a copy of the previous release's
  schema, then runs the tests. Check heavy migrations against production-sized data.

## Performance checks

- For each new hot query, run `EXPLAIN (ANALYZE, BUFFERS)` on realistic data volume. Look for
  sequential scans on large tables, bad row estimates and sorts spilling to disk. `ANALYZE`
  executes the statement, so wrap writes in `BEGIN; ... ROLLBACK;`.
- Enable `pg_stat_statements` and review the top queries by total time, not just mean time.
- Log slow statements (`log_min_duration_statement`) and lock waits (`log_lock_waits = on`).
- Watch dead tuples and autovacuum on high-churn tables (`pg_stat_user_tables`).
- Time-series or retention-heavy tables: consider declarative partitioning by time, so old data
  is removed with `DROP`/`DETACH PARTITION` instead of mass `DELETE`.

## Security

- Separate roles: an owner/migration role that owns the schema, and an application role with
  only `SELECT/INSERT/UPDATE/DELETE` on the tables it needs (and `USAGE` on sequences). No
  `GRANT ALL`, no superuser for the app. Read-only roles for reporting.
- Use `ALTER DEFAULT PRIVILEGES` so tables created by future migrations get the right grants.
- `REVOKE CREATE ON SCHEMA public FROM PUBLIC` on databases created before Postgres 15.
- TLS for every non-local connection (`sslmode=verify-full` in clients that support it).
  Credentials come from a secret store or env, never from the repo.
- Hash passwords in the application (argon2id), not with `pgcrypto` and never stored reversibly.
  Encrypt highly sensitive columns at the application layer when the threat model needs it.
- Tests run against real Postgres with the same roles and RLS as production, not as a superuser
  (a superuser bypasses RLS and hides missing grants).
