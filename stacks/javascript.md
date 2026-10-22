# JavaScript guide

For plain JS (scripts, tooling, legacy code). New application code should be TypeScript
unless the project decided otherwise.

- ES modules (`import`/`export`, `"type": "module"`). No CommonJS in new code.
- `const` by default, `let` when reassigned, never `var`.
- Strict equality (`===`). Explicit `Number()`/`String()` conversions, no implicit coercion tricks.
- Type with JSDoc where the code is shared or non-trivial
  (`/** @param {string} id @returns {Promise<Org>} */`). Enable `// @ts-check` on such files.
- Validate external input at the boundary (schema library), same as in TypeScript.
- Errors: throw `Error` instances with `cause`. Never throw strings. Never swallow errors silently.
- Async: `async`/`await`, no floating promises, `Promise.all` for independent work.
- No mutation of function arguments. Return new objects/arrays.
- Avoid clever one-liners. Optimize for the next reader.
- Node built-ins via the `node:` prefix (`import { readFile } from 'node:fs/promises'`).
- Tests with the project's runner (`node:test` for zero-dependency tooling).
