# Node.js (backend) guide

Read together with the TypeScript guide, `api.md` for HTTP API design and `postgres.md` for
the database. Project conventions override this.

## Structure

- Layering: **routes/handlers** (HTTP concerns: parse, validate, map errors) -> **services**
  (business rules, authorization decisions) -> **repositories** (data access). Handlers
  don't talk to the DB. Repositories don't know about HTTP.
- Dependencies (DB pool, clock, mailer) are passed in, so tests can swap them. No hidden
  module-level singletons that tests can't control.
- Config comes from env vars, validated with a schema **at startup**. The process refuses to
  boot on invalid config. No `process.env.X` reads scattered through the code.

## HTTP

- Validate every request body, query and param with a schema (zod, or the framework's schema
  validation). Reject unknown fields on writes (`.strict()`).
- **Authorize on the server for every operation**, in the service layer, based on the
  authenticated principal: never on IDs or roles sent by the client.
- Domain errors map to the API's error shape and status codes in one error handler. Never
  leak stack traces or SQL errors to clients.
- Set body-size limits on the body parser and multipart handler.

## Data

- Parameterized queries only. Never build SQL by string concatenation.
- Transactions around multi-statement invariants. With a pool, run the whole transaction on
  one checked-out client and always release it (`finally`).
- `bigint`/`numeric` columns arrive as strings in `pg` by default. Keep them as strings or
  `bigint`/decimal types; never parse them into `number`.

## Security

- Hash passwords with argon2id (or bcrypt with a proper cost). Store refresh tokens hashed.
- Rate-limit auth endpoints. Set secure, httpOnly, sameSite cookies for sessions.
- Set security headers (helmet or equivalent) and a CORS allowlist, not `*` with credentials.
- Secrets never go in code or logs. Redact PII in logs.
- Tokens and IDs that must be unguessable come from `crypto.randomBytes`/`crypto.randomUUID`,
  never `Math.random`. Compare secrets with `crypto.timingSafeEqual`.
- Never pass user input to a shell: use `execFile`/`spawn` with an argument array, not `exec`.
- Don't deep-merge or `Object.assign` untrusted objects into existing ones (prototype
  pollution). Parse into a schema-validated object instead.
- Paths from user input: resolve and verify the result stays inside the intended directory.
- Don't build `RegExp` from user input; guard user-facing regexes against catastrophic
  backtracking.
- `npm audit` / `pnpm audit` in CI. Pin versions with a lockfile.

## Reliability

- Structured logging (pino) with a request ID passed through. Log at boundaries, not in
  tight loops.
- Graceful shutdown: stop accepting connections, drain, close pools.
- Timeouts on every outbound call (`AbortSignal.timeout(ms)`). Retry only idempotent calls and
  retriable failures (network errors, `429`, `503`), with bounded attempts, exponential
  backoff and jitter.
- Crash on `unhandledRejection` and `uncaughtException` after logging, and let the process
  manager restart. Don't keep running in an unknown state.
- Don't block the event loop with CPU work. Use a worker or a queue for PDF generation, bulk
  exports and similar jobs.

## Testing

- Integration tests hit the real HTTP layer (supertest/`app.inject`) and a real Postgres
  (testcontainers or a per-test schema/transaction). Mock only third-party network services.
- Each permission rule has a test proving the denial, not just the allowed path.
- Fake timers (`vi.useFakeTimers()`) instead of real sleeps for time-dependent logic.
