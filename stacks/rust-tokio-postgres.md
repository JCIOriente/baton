# Rust + tokio-postgres guide

Read together with `rust.md`. Covers `tokio-postgres` with a pool (`deadpool-postgres` or
`bb8-postgres`).

## Connections

- Always use a **pool**, created once at startup and shared through `AppState`. Never open a
  connection per request.
- Size the pool deliberately: roughly the DB's connection budget divided by the instances. Set
  a wait timeout so overload fails fast instead of hanging.
- Set `statement_timeout` (and `idle_in_transaction_session_timeout`) per connection or role.
- TLS in production (`tokio-postgres-rustls` or `postgres-native-tls`). `NoTls` only for local and test.
- **Don't hold a pooled connection across unrelated awaits** (HTTP calls, sleeps). Get it, do
  the DB work, drop it.

## Queries

- **Parameters only:** `client.query("... WHERE id = $1", &[&id])`. Never `format!` values
  into SQL. Dynamic identifiers (sort column) come from an allowlist `match`, never from user
  strings.
- Prepare hot statements once per connection: `client.prepare_cached(...)` with deadpool.
- `query_one` when exactly one row is required, `query_opt` when zero or one, `query` for
  lists. Map "no row" to a domain `NotFound`, not a 500.
- Map rows in one place per type: `impl TryFrom<&Row> for Org` using `row.try_get("col")?`
  (by name, not index). Mapping failures are errors, not panics, so don't use `row.get`.
- Select explicit columns, never `SELECT *`. Schema changes then break at compile time
  instead of silently.
- Types: `uuid::Uuid` (feature `with-uuid-1`), `time`/`chrono` for `timestamptz` (pick one
  per project), `serde_json::Value` for `jsonb`, `rust_decimal` for money. **Never `f64` for
  money.**
- Lists are paginated: keyset (`WHERE (created_at, id) < ($1, $2) ORDER BY ... LIMIT $3`) for
  large or append-heavy tables, offset for small admin lists.
- Bulk inserts: `UNNEST($1::uuid[], $2::text[])` or `COPY ... FROM STDIN BINARY`, not N
  round trips.

## Transactions

- Multi-statement invariants go in a transaction: `let tx = client.transaction().await?;
  ...; tx.commit().await?`. If the `Transaction` is dropped without commit, it rolls back.
  Rely on that for error paths.
- Repository functions take `&impl GenericClient` (deadpool's or tokio-postgres's), so the
  same function works on a pooled client or inside a transaction.
- Keep transactions short. No network calls inside them.
- Use `SELECT ... FOR UPDATE` (or `SKIP LOCKED` for job queues) for read-modify-write races.
  Unique constraints plus `ON CONFLICT` for idempotency (e.g. "attendance already recorded").

## Errors

Map `tokio_postgres::Error` via `err.code()` (`SqlState`) into domain errors:
`UNIQUE_VIOLATION` -> `Conflict`, `FOREIGN_KEY_VIOLATION` -> `InvalidReference`,
`SERIALIZATION_FAILURE` -> retry (bounded) or `Conflict`. Everything else is an internal error,
logged with context and never returned to the client verbatim.

## Schema and migrations

- Versioned SQL migrations (`refinery`, `sqlx-cli` used only for migrations, or the project's
  tool), run on deploy and in CI. Forward-only. A fix is a new migration.
- Constraints live in the database: `NOT NULL`, `CHECK`, `UNIQUE`, foreign keys. Application
  validation is not a substitute.
- Index every foreign key and every column used in frequent filters. Check plans with
  `EXPLAIN (ANALYZE, BUFFERS)` for new hot queries.
- `timestamptz` for timestamps, UUIDs (v7 if available) or `bigint generated always as
  identity` for IDs. Pick one convention per project.
- Multi-tenant data (e.g. per local organization): the tenant column is on every scoped table,
  and every scoped query filters on it. Consider Row-Level Security as a second line of
  defense.

## Testing

- Integration tests run against **real Postgres** (testcontainers-rs, or a CI service
  container), with migrations applied.
- Isolate tests: a transaction per test that is never committed, or a fresh schema/database
  per test.
- Test constraint behavior (duplicates, FK violations) and permission-scoped queries, not
  just the happy path.
