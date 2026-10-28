# Common guide

Baseline for all code in any language. Stack guides refine it. Project conventions override this.

## Readability and naming

- Optimize for the next reader. Clear beats clever. A plain loop beats a dense one-liner.
- Names say what a thing holds or does, in the domain's vocabulary. Booleans read as claims
  (`isActive`, `hasAttended`). Functions are verbs. No unexplained abbreviations.
- Match the surrounding code's naming, casing and structure, even if you'd choose otherwise.
- Early returns over nested conditionals. More than three levels of nesting is a signal to
  split the code.

## Scope of a change

These rules follow Andrej Karpathy's observations on LLM coding pitfalls: agents run with
unstated assumptions, overbuild, and change code they don't understand as a side effect.

- Every changed line traces back to the task. If you can't say which requirement a line serves,
  it doesn't belong in this change.
- Don't "improve" nearby code, comments or formatting while you're there, and don't refactor
  what isn't broken. Match the existing style, even where you'd write it differently.
- Clean up only your own leftovers: imports, variables and functions that *your* change made
  unused. Pre-existing dead code or problems you notice get mentioned (or become an issue), not
  silently deleted or fixed.
- If you're unsure what the request means, or a simpler approach than the one asked for exists,
  say so before building. Don't pick one reading silently.
- If the change came out much larger than the problem (hundreds of lines where tens would do),
  stop and simplify before asking for review.

## Simplicity

- **KISS:** the simplest design that meets today's requirements. No speculative options,
  plugin points or config flags (**YAGNI**).
- **DRY applies to knowledge, not text.** One source of truth for a business rule, a
  constant or a schema. Similar-looking code that changes for different reasons is not
  duplication. Wait until the third occurrence, or until the shared concept is clear, before
  extracting. A wrong abstraction costs more than duplication.
- **Avoid shared mutable state.** Don't mutate arguments, globals or data other code holds a
  reference to. Local mutation inside a function (building a list, an accumulator) is fine
  and often clearer than chained copies. Don't apply "never mutate" as a universal rule.
- Configuration and limits are named constants or config, not magic numbers or strings in
  logic. `0`, `1` and obvious literals don't need names.

## Size heuristics

- A function does one thing at one level of abstraction. Past ~50 lines, or when it needs
  section comments, consider splitting. Long but linear code (a mapping table, a migration)
  is fine.
- A file holds one cohesive concept. Past a few hundred lines, check whether it holds two.
- Organize by feature/domain rather than by technical layer, unless the project does otherwise.
- These are prompts to look, not limits to enforce mechanically.

## Comments

- Comment **why**, not what: constraints, trade-offs, workarounds (with a link to the
  issue), invariants a reader can't see. If code needs a "what" comment, rename or restructure.
- Public APIs get doc comments describing contract, errors and edge cases.
- Keep comments true. Update or delete them with the code they describe.
- Don't add commented-out code or dead code. Version control remembers it. (Existing dead code
  outside your task: see Scope of a change.)
- `TODO` only with an issue reference (`TODO(#123): ...`).

## Errors

- Fail fast on invalid input at the boundary. Inside, trust validated types.
- Propagate errors with the **cause preserved** (wrap and add context, don't replace with a
  new message). Handle an error where you can do something about it, not everywhere.
- Never swallow errors silently. Ignoring one is a deliberate decision with a comment.
- Don't add handling for states that validation or the types already rule out. Defensive
  branches for the impossible are noise that hides the real error paths.
- Users see safe, actionable messages. Logs get the detail. Never leak stack traces,
  SQL or internal IDs in responses.

## Logging

- Structured logs (key-value fields), with a request/correlation ID where one exists.
- Levels mean something: `error` needs attention, `warn` is unexpected but handled, `info`
  is a business event, `debug` is for development.
- Never log secrets, tokens, passwords or full personal data (emails, phone numbers,
  addresses). Redact or omit.
- No leftover debug prints (`console.log`, `println!`, `dbg!`) in committed code.

## Dependencies

- Add one only when it pays for itself. Check maintenance, license compatibility, size and
  transitive dependencies first. Prefer the standard library and what the project already uses.
- Commit lock files. Pin toolchains. Don't upgrade unrelated dependencies in a feature change.
- No secrets in the repo. Config comes from the environment, validated at startup.

## Tests

- New behavior and bug fixes come with tests. A bug fix starts with a test that fails.
- Test behavior through public interfaces, not implementation details.
- Tests are deterministic: no real clocks, random seeds or network unless the test is about them.

## Commits

- Conventional Commits: `type(scope): imperative summary` (`feat`, `fix`, `refactor`,
  `test`, `docs`, `perf`, `build`, `ci`, `chore`). Follow the repo's history for scope use
  and subject length.
- A clear subject is usually enough. Add a body only when the why isn't obvious from the
  subject and the diff, and keep it to one or two short paragraphs. Don't list changed files or
  restate the diff. Trailers (`BREAKING CHANGE:`, `Co-Authored-By:`) don't count as paragraphs.
- Breaking changes use `!` and a `BREAKING CHANGE:` footer describing the migration.
- Small and focused: one logical change per commit. Split unrelated fixes, refactors and
  formatting.
- Reference the task or issue in the footer (`Refs #123`, `Closes #123`). Add a body when
  the why isn't obvious from the diff.
