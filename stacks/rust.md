# Rust guide

Project conventions override this. For database code also read `rust-tokio-postgres.md` and
`postgres.md`; for HTTP APIs, `api.md`.

## Baseline

- `cargo fmt` and `cargo clippy --all-targets --all-features -- -D warnings` are clean.
  `#[allow(clippy::...)]` only with a comment explaining why, on the narrowest item.
- Pin the edition and the toolchain (`rust-toolchain.toml`). Use workspace dependencies in
  multi-crate repos.
- No `unsafe` in application code. Where it is unavoidable (FFI), every block has a
  `// SAFETY:` comment stating the invariants it relies on.

## Errors

- **Libraries / domain crates:** typed errors with `thiserror`. Each variant means something
  a caller can act on.
- **Binaries / top-level glue:** `anyhow` is fine for propagation with `.context("...")`.
- **No `unwrap()` / `expect()` on fallible paths** in non-test code. `expect("reason")` is
  allowed for true invariants (e.g. a compile-time-valid regex) and the message states the
  invariant.
- Propagate with `?`. Don't turn errors into strings early. Keep the source chain: wrap with
  `#[from]`/`#[source]`, not `Parse(String)` built from `e.to_string()`.
- Never discard a `Result` with `let _ =` unless ignoring it is correct, with a comment saying why.
- HTTP handlers map domain errors to responses in **one** `IntoResponse` impl. Internal
  details are logged, not returned.

## Types and design

- Make invalid states unrepresentable: newtypes for IDs (`struct OrgId(Uuid)`) and validated
  values (`Email`), enums for state machines, `Option` instead of sentinel values.
- Constructors validate (`TryFrom`/`fn new(..) -> Result`). After that, the type is trusted.
- Borrow in parameters (`&str`, `&[T]`), own in struct fields. Clone deliberately, not to
  silence the borrow checker. If you're cloning a lot, rethink ownership.
- Match domain enums exhaustively, without a `_` arm, so a new variant fails to compile where
  it must be handled.
- Prefer iterators and combinators where they read clearly. A plain `for` loop is fine.
- Keep modules small with a clear public surface. `pub(crate)` by default.
- Derive `Debug` everywhere, but **redact secrets** (custom `Debug`, or `secrecy::SecretString`).

## Async (tokio)

- Never block the runtime: no `std::thread::sleep`, blocking I/O or heavy CPU work in async
  code. Use `tokio::task::spawn_blocking` for CPU-bound or blocking work (PDF rendering,
  image processing, bcrypt/argon2).
- **Don't hold a `std::sync::Mutex` guard across `.await`.** Restructure, or use
  `tokio::sync::Mutex` when the lock really must be held across awaits.
- Spawned tasks: keep the `JoinHandle` or use a `JoinSet`/`TaskTracker`, and handle their
  errors. No fire-and-forget without logging.
- Graceful shutdown via a cancellation token / shutdown signal passed to long-running tasks.
- Timeouts on outbound I/O (`tokio::time::timeout`, client timeouts).

## Web (axum or the project's framework)

- Handlers are thin: extract, validate, call a service, map the result.
- Shared state is `Arc<AppState>` holding pools and config, with no global statics.
- Authentication in an extractor or middleware that yields a typed `Principal`.
  **Authorization in the service layer**, checked against the principal for every operation.
- Validate request DTOs (`validator` or `TryFrom` into domain types) and deny unknown fields
  on writes (`#[serde(deny_unknown_fields)]`).
- Set a request body limit and a request timeout (tower-http layers or the framework's).
- `tracing` with spans per request. Fields go in structured form, not formatted into messages.

## Security

- Arithmetic on untrusted numbers uses `checked_*`/`saturating_*`; release builds wrap on
  overflow silently. Convert between integer types with `try_from`, not `as`, which truncates.
- Compare secrets and tokens in constant time (`subtle::ConstantTimeEq`), not with `==`.
- Tokens, nonces and IDs that must be unguessable come from a CSPRNG (`rand::rngs::OsRng`,
  `getrandom`), never from a seeded or thread-local RNG.
- Never build file paths from user input; if unavoidable, reject `..` and absolute paths and
  verify the canonical path stays inside the intended directory.

## Testing

- Unit tests next to the code (`#[cfg(test)] mod tests`). Integration tests in `tests/`
  through the public API or HTTP router (`tower::ServiceExt::oneshot`).
- `#[tokio::test]` for async tests. Real Postgres for DB tests (see the tokio-postgres guide).
- Test names describe the behavior: `create_org_requires_national_admin`.
- Property tests (`proptest`) for parsers and validation logic. `rstest` for table-driven cases.
- Assert the specific error, not just failure: `assert!(matches!(err, OrgError::Conflict { .. }))`.
  Tests may return `Result` and use `?` instead of `unwrap()` chains.
- Mock only at trait boundaries to external services (`mockall` or a hand-written fake). Don't
  mock the database; use the real one.
- No `sleep` in tests. Use `tokio::time::pause()`/`advance()` for timers and channels or
  barriers for coordination.

## Dependencies

Run `cargo deny` / `cargo audit` in CI. Keep features minimal (`default-features = false`
when it matters). Prefer well-maintained crates. Each new dependency needs a reason.
