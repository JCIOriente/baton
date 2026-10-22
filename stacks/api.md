# HTTP API guide

Applies to designing and reviewing HTTP/JSON APIs in any language. Project conventions override
this. The contract workflow is in `openapi.md`.

## Resources and naming

- Paths are plural nouns in kebab-case: `/orgs/{orgId}/events`, `/event-types`. No verbs for
  CRUD (`/getEvents`).
- Nest only to express ownership, and at most one level deep. Give each resource one canonical
  path; filter instead of adding alternative nestings (`/events?orgId=...`).
- Actions that are not CRUD are explicit sub-resources with `POST`:
  `POST /certificates/{id}/revoke`. Use them sparingly, but prefer them to overloading `PATCH`
  with state transitions that have their own rules.
- One casing for JSON fields across the API (camelCase suits TypeScript clients). Never mix.
- Request and response bodies are explicit DTOs, never serialized database rows or ORM models.
  This prevents leaking internal columns and accepting fields the client must not set.

## Methods and status codes

- `GET` is safe and has no side effects. `PUT` replaces and `DELETE` removes, both idempotent.
  `PATCH` is a partial update (JSON Merge Patch semantics unless documented otherwise).
- Success: `200` with a body, `201` with `Location` for creation, `202` for accepted async work,
  `204` with no body.
- Client errors: `400` malformed request, `401` missing or invalid credentials, `403`
  authenticated but not allowed, `404` not found (also for resources the caller may not know
  exist), `409` state conflict or duplicate, `412` failed `If-Match`, `413` body too large,
  `415` unsupported media type, `422` well-formed but invalid input, `429` rate limited.
  Pick 400 or 422 for validation failures once and use it everywhere.
- Server errors: `500` with a generic message, `503` with `Retry-After` when overloaded.
- Never return `200` with an error in the body.

## Errors

- One error shape for every endpoint. RFC 9457 problem details (`application/problem+json`) is a
  good default; follow the project's existing shape if it has one.
- Every error carries a stable machine-readable `code` and, for validation, a list of field
  errors (`path`, `code`). Clients branch and localize on codes, never on message text.
- Include a request/trace ID (also as a response header) so a report can be matched to logs.
- Never expose stack traces, SQL, internal hostnames or library error text. Log those server-side.
- Document every error code an operation can return in the contract.

## Data formats

- Timestamps are RFC 3339 strings with offset (`2026-03-01T18:00:00Z`). Dates are `YYYY-MM-DD`.
- IDs are strings in JSON, even if numeric in the database (JavaScript loses precision above 2^53).
- Money is a decimal string or an integer in minor units, plus a currency code. Never a float.
- Absent vs `null` vs empty means something different; define which ones a field allows.
- Clients must ignore unknown response fields, so the server can add fields without breaking them.

## Pagination, filtering and sorting

- Every list endpoint is paginated, with a default and a maximum page size enforced by the server.
- Cursor pagination is the default for large or growing collections: an opaque `cursor` that
  encodes the sort key plus a unique tiebreaker, and a `nextCursor` that is `null` on the last page.
  Treat cursors as untrusted input; validate or sign them.
- Offset/page pagination is fine for small, bounded lists where users jump to page N.
- Totals are optional and opt-in on large collections; exact counts are expensive.
- Filter and sort fields come from a per-endpoint allowlist mapped to columns in code. Reject
  unknown parameters with `400` instead of silently ignoring them. Cap the number of values in
  list filters and the length of search terms.
- Sorting syntax is consistent: `sort=-startsAt,name`.

## Versioning and evolution

- Additive changes (new endpoints, new optional fields, new optional parameters) are
  non-breaking. Removing or renaming fields, changing types or meaning, making optional input
  required, and adding enum values that clients must handle are breaking.
- Breaking changes go to a new version (`/v2/...` path prefix is the simplest) or a new
  endpoint, never silently into the existing one.
- Deprecate with notice: mark it in the contract and send `Deprecation` and `Sunset` headers
  before removal.

## Idempotency and concurrency

- Retried requests must not duplicate side effects. `PUT`/`DELETE` are idempotent by design.
  `POST`s that create or trigger something (issue a certificate, send an invitation, charge)
  accept an `Idempotency-Key` header, or rely on a natural unique key.
- Idempotency keys are scoped to the principal, stored with a hash of the request and the
  response, and replayed on repeat. The same key with a different body is an error. Keys expire.
- Lost updates on contended resources: return an `ETag` (or a `version` field) and require
  `If-Match` on updates; a mismatch is `412`.

## Authentication and authorization

- Every operation requires authentication unless it is explicitly listed as public in the
  contract. Deny by default.
- Authorize every operation on the server against the authenticated principal. Never trust
  roles, tenant IDs or user IDs sent by the client.
- Object level: load resources scoped to what the principal may access (tenant filter in the
  query), not "load by ID, then maybe check". Return `404` for objects outside that scope.
- Property level: role-dependent fields are filtered on output and rejected on input (no mass
  assignment of `role`, `orgId`, `status`).
- Function level: admin and cross-tenant operations check the capability explicitly. Each
  permission rule has a test that proves the denial.
- Tokens go in the `Authorization` header or secure, httpOnly, `SameSite` cookies, never in URLs.
  Cookie-based auth needs CSRF protection on state-changing requests.

## Input validation and resource limits

- Validate path, query, headers and body against a schema at the boundary: types, lengths,
  ranges, formats, enums. Reject unknown fields on writes.
- Enforce limits on body size, array lengths, nesting depth and page size before processing.
- Rate-limit per principal, plus per IP for unauthenticated routes. Stricter limits on login,
  password reset, invitation and other abuse-prone flows, and on expensive operations (exports,
  PDF generation, reports). Return `429` with `Retry-After`.
- Set timeouts on every request and on outbound calls made while serving it.
- Outbound requests to client-supplied URLs (webhooks, imports) go through an allowlist and block
  private and metadata addresses (SSRF).

## Files

- Uploads: enforce the size limit while streaming, check the type from the content (magic
  bytes) against an allowlist, not from the extension or `Content-Type`. Store under a generated
  name outside any served directory; never use the client filename in a path. Large files go
  directly to object storage via short-lived pre-signed URLs.
- Downloads: authorize every request, send `Content-Disposition: attachment` with a sanitized
  filename, the correct `Content-Type` and `X-Content-Type-Options: nosniff`. Sensitive
  responses get `Cache-Control: no-store`.
- Public verification links (documents anyone may check) use unguessable identifiers and
  return only the minimum needed to verify.

## Long-running work

- Work that can exceed a few seconds (bulk imports, exports, report and PDF batches) returns
  `202 Accepted` with `Location: /jobs/{id}`.
- The job resource exposes `status` (`queued | running | succeeded | failed`), progress if
  known, a link to the result, and an error object on failure. It is authorized like the work
  it represents. Results expire.
- Job submission is idempotent. Clients poll with backoff (honour `Retry-After`) or receive
  a notification; the server never holds the request open waiting.

## Security checklist (OWASP API Top 10, 2023)

- Object-level authorization on every ID in the path, query or body.
- Authentication: strong password hashing, rate-limited login, short-lived tokens, revocation.
- Property-level authorization: no excessive data in responses, no mass assignment.
- Resource consumption: size, page, rate and timeout limits everywhere.
- Function-level authorization on admin and privileged operations.
- Sensitive business flows (sign-up, invitations, issuance) protected against automated abuse.
- SSRF protections on any server-side fetch of user-supplied URLs.
- Configuration: HTTPS only with HSTS, CORS allowlist (no `*` with credentials), security
  headers, debug endpoints off, verbose errors off in production.
- Inventory: every endpoint is in the contract; no undocumented or forgotten old versions running.
- Data from third-party APIs is validated like user input.
- Audit-log privileged actions (who, what, when, on which tenant) without logging secrets or PII.
