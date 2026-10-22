# Node.js (backend) guide

Read together with the TypeScript guide.

## Structure

- Layering: **routes/handlers** (HTTP concerns: parse, validate, map errors) -> **services**
  (business rules, authorization decisions) -> **repositories** (data access). Handlers
  don't talk to the DB. Repositories don't know about HTTP.
- Dependencies (DB pool, clock, mailer) are passed in, so tests can swap them. No hidden
  module-level singletons that tests can't control.
- Config comes from env vars, validated with a schema **at startup**. The process refuses to
  boot on invalid config. No `process.env.X` reads scattered through the code.

## HTTP

- Validate every request body, query and param with a schema. Reject unknown fields on writes.
- **Authorize on the server for every operation**, in the service layer, based on the
  authenticated principal: never on IDs or roles sent by the client.
- A consistent error shape (`{ error: { code, message, details? } }`), with domain errors
  mapped to status codes in one place. Never leak stack traces or SQL errors to clients.
- Paginate list endpoints by default. Set a max page size.
- Idempotency for operations that may be retried (payments, certificate issuance).

## Data

- Parameterized queries only. Never build SQL by string concatenation.
- Transactions around multi-statement invariants.
- Migrations are versioned, forward-only and run in CI against a real database.

## Security

- Hash passwords with argon2id (or bcrypt with a proper cost). Store refresh tokens hashed.
- Rate-limit auth endpoints. Set secure, httpOnly, sameSite cookies for sessions.
- Set security headers (helmet or equivalent) and a CORS allowlist, not `*` with credentials.
- Secrets never go in code or logs. Redact PII in logs.
- `npm audit` / `pnpm audit` in CI. Pin versions with a lockfile.

## Reliability

- Structured logging (pino) with a request ID passed through. Log at boundaries, not in
  tight loops.
- Graceful shutdown: stop accepting connections, drain, close pools.
- Timeouts on every outbound call.
- Don't block the event loop with CPU work. Use a worker or a queue for PDF generation, bulk
  exports and similar jobs.

## Testing

- Integration tests hit the real HTTP layer (supertest/`app.inject`) and a real Postgres
  (testcontainers or a per-test schema/transaction). Mock only third-party network services.
- Each permission rule has a test proving the denial, not just the allowed path.
