# TypeScript guide

Applies to all TypeScript code (frontend and backend). Project conventions override this.

## Compiler

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` where the
  codebase already compiles with them, and `noImplicitOverride`. Don't relax compiler flags to
  make an error go away.
- `typecheck` (`tsc --noEmit`) is part of validation. Code that only builds through a
  bundler that strips types is not type-checked.

## Types

- **No `any`.** Use `unknown` at trust boundaries and narrow it. `any` is allowed only in a
  typed wrapper around an untyped library, with a comment.
- **No `@ts-ignore`.** `@ts-expect-error` with a reason, only when the compiler is wrong.
- **No non-null `!`** unless an invariant guarantees it, with a comment. Prefer narrowing.
- **Validate external data at the boundary** (HTTP bodies, env vars, `localStorage`, API
  responses) with a schema library (zod/valibot) and derive the type from the schema:
  `type Org = z.infer<typeof OrgSchema>`. Never cast with `as` to claim untrusted data is typed.
- Model states as **discriminated unions**, not bags of optional fields:
  ```ts
  type Load<T> = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: Error };
  ```
  Use exhaustive `switch` with a `never` check in `default`.
- Prefer `type` aliases for unions and data shapes and `interface` for extendable object contracts.
  Follow whatever the codebase already does.
- Brand IDs that are easy to mix up: `type OrgId = string & { readonly __brand: 'OrgId' }`.
- `readonly` for data that must not be mutated, `as const` for literal tables.
- Avoid `enum`. Use string-literal unions or `as const` objects.

## Functions and modules

- Explicit return types on exported functions. Inferred types are fine for local helpers.
- Small, pure functions. Side effects at the edges.
- Named exports, no default exports (unless a framework requires them, e.g. route files).
- No barrel files that re-export whole directories in app code. They hurt tree-shaking and
  create import cycles.
- Use `import type` for type-only imports.

## Errors

- Throw `Error` subclasses (or return a `Result` union where the codebase uses that), never
  strings. Preserve the cause: `new AppError('...', { cause: err })`.
- Don't swallow errors. `catch (e) {}` needs a comment explaining why ignoring it is correct.
- In `catch`, the error is `unknown`. Narrow it before use.

## Async

- No floating promises (`@typescript-eslint/no-floating-promises`). Either `await`, `return`,
  or `void` with a comment.
- `Promise.all` for independent work. Sequential `await` in a loop only when order matters.
- Pass `AbortSignal` through for cancellable work (fetch, long tasks).

## Testing

- Vitest (or the project's runner). Test behavior through public APIs.
- Type-level tests (`expectTypeOf`) for non-trivial generic utilities.
- No snapshot tests of large objects as the only assertion.

## Lint

typescript-eslint with type-aware rules (`recommendedTypeChecked`). Don't disable rules
inline without a reason in the same comment.
