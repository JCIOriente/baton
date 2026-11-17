# Engineering standard, layout and size: the `structure` gate — Spec

- Status: draft
- Date: 2026-11-17
- Owner: Arnold Gandarillas
- Related: #136 (this spec), #137 (umbrella; this is its spec 2 of 4), #185 (blocks the CLI
  tasks), [gates core spec](2026-11-16-gates-core.md),
  [ADR-0003](../adr/0003-validate-is-the-gate-list.md)

## TL;DR
- New command `baton structure`. It fails when a tracked source file is longer than the size
  limit (500 lines by default, tests included) and isn't listed in the baseline.
- The limit, the exclusions for generated code and the baseline live in `.baton/config.json`
  under `structure`. The baseline only shrinks: a listed file must match its recorded count
  exactly, and baton prints the edit but never writes it.
- The `structure` gate now applies in every repo, so `baton doctor` reports a repo with no step
  for it. baton's own repo adds the step and a baseline for its five long files.
- The stack guides get layout rules:
  - `common.md` turns its size prompt into a rule and adds the move-or-change rule and the
    structure triggers;
  - `rust.md`, `react.md`, `typescript.md` and `node.md` get Layout sections. Their layer
    direction is enforced by the repo's linter or `cargo tree`, not by baton.
- `baton:plan`, `baton:verify` and the code-quality reviewer learn the rules: the split goes in
  the task that would cross the limit, nobody raises the baseline to get green, and review
  looks only at what the guard can't see.

## Change in a nutshell
A repo adds one step and, if it already has long files, a baseline:

```json
"validate": [
  { "name": "structure", "gates": ["structure"], "run": "baton structure" }
],
"structure": {
  "maxLines": 500,
  "exclude": ["src/gen/**"],
  "baseline": { "src/session.rs": 3789 }
}
```

A task that adds a 612-line file and shortens `session.rs` gets:

```text
$ baton structure
✖ src/tray.rs: 612 lines, over the 500-line limit and not in structure.baseline. Split it (stacks/common.md, Size and structure).
✖ src/session.rs: 3701 lines, baseline 3789. It shrank: set structure.baseline["src/session.rs"] to 3701.
structure: 214 files checked, limit 500, 1 in baseline, 2 failures
To record these instead of fixing them (needs the owner's approval), add to structure.baseline:
  "src/tray.rs": 612
```

It exits 1. The agent splits `tray.rs` and edits the baseline entry by hand. `baton verify`
runs the step like any other, locally and in CI.

## Problem
Repos built with baton grow a few very large files and keep business logic inside the
UI-framework layer. Orasenda's `session.rs` reached 3,789 lines, and Orientate has repositories
of over 2,400 lines (#136, #137 "What happened"). Three causes:
- adding to a file a task already owns is the cheapest path;
- review checks behavior, not module shape;
- `stacks/common.md:45-52` calls size limits "prompts to look, not limits to enforce", and no
  guide gives a Rust or React layout.

The gates core (spec 1) reserved the `structure` gate, but nothing applies or implements it
(`cli/lib/gates.mjs:44-58`).

## Goals / Success criteria
1. `baton structure` exits 1, with one line per finding, when any of these holds. Otherwise it
   exits 0 with the summary line.
   - A counted file is over `maxLines` and not in the baseline.
   - A baseline file's count differs from its entry while still over the limit.
   - A baseline file is at or under the limit.
   - A baseline path is not a counted file.
2. A counted file is tracked by git, has a source extension (Interfaces), isn't matched by
   `structure.exclude`, and is a regular file in the working tree. Test files count.
3. `.baton/config.json` accepts `structure.maxLines`, `structure.exclude` and
   `structure.baseline`. `baton` refuses a config with a wrong type or an unknown key under
   `structure`, and names the key. A config without `structure` behaves as
   `{ "maxLines": 500, "exclude": [], "baseline": {} }`.
4. `baton structure` never writes a file. Every finding says which edit fixes it.
5. `applicableGates` returns `structure` for every repo, with the reason `always`. So
   `baton doctor` reports `gate 'structure' applies (always) but no step covers it and
   gates.skip doesn't list it` until a step covers it or `gates.skip` lists it.
6. baton's own repo:
   - has a `structure` step;
   - lists in `structure.baseline` every file over 500 lines when the dogfood task runs (today:
     `cli/baton.mjs` and four test files);
   - `baton doctor` reports no gate gaps and `baton verify` passes.
7. The guides say:
   - `stacks/common.md`: file size is a rule enforced by the `structure` gate. A refactor PR
     moves code or changes it, never both. Structure is added on the triggers listed in
     Interfaces, not predicted. Function size stays a prompt.
   - `stacks/rust.md`, `react.md` and `typescript.md` gain a Layout section, and `node.md`'s
     Structure section is extended. Each gives the layout, the layer direction and the lint
     rule or command that enforces it. Each lint rule comes with a fixture that must fail.
8. The skills and reviewers say:
   - `baton:plan`: a task that would push a file past the limit includes the split and owns the
     new sibling files;
   - `baton:verify`: never raise `maxLines`, add or raise a baseline entry, or add an `exclude`
     to get green;
   - `reviewers/code-quality.md`: drop the size check the guard now does, and add logic in an
     adapter, an import that crosses a layer the linter doesn't cover, and a refactor that both
     moves and changes code.

## Non-goals
- A baton import-direction checker. Layer direction is the linter's job (restricted imports)
  and `cargo tree`'s, per the guides. Picked by the owner.
- Choosing the linter for layer rules (Biome or ESLint): spec 3's presets. The guides name the
  rule in both.
- Kind profiles (web app, Rust service, desktop, ...) and per-unit gates in a monorepo: spec 4.
  The Layout sections are per stack.
- A command that writes the baseline. Picked by the owner: print, don't write.
- Baselines for other gates (lint, dead code), and the gate-integrity review that flags a
  raised baseline in a diff: later #137 specs.
- Splitting baton's own long files. Paying down a baseline is planned backlog work (#137 §9.5).
- Reading config from the current worktree: #185, a bug fix this spec's CLI tasks depend on.
- `baton init` suggesting a `structure` step: spec 3, with the rest of `init`'s catalog
  suggestions. Until then a new repo's `doctor` reports the gap. Picked by the owner.
- Layer-rule fixtures that baton ships and tests. The guides give the recipe. Picked by the
  owner.

## Approaches
Settled with the owner on 2026-11-17 before this was written:
- **Guard form: built-in command, a script template per repo, or a recipe in the guides:**
  built-in. It is tested once in baton, which covers #137 §3.7 ("custom guards are tested"),
  and it works for any stack. The cost is that steps need `baton` on `PATH`. The plugin's
  `bin/` and CI's `npm exec` already provide it. Picked by the owner.
- **Name: `baton size`, `baton structure` or `baton check size`:** `baton structure`, matching
  the gate. Picked by the owner.
- **Where the limit and the baseline live: limit in config plus a baseline file, all in config,
  or a fixed 500 with only a baseline:** all in `.baton/config.json`, under `structure`. Picked
  by the owner.
- **Baseline ratchet: exact count or ceiling:** exact. A listed file must match its entry, so
  every shrink is recorded and the baseline only goes down. Picked by the owner.
- **Writing the baseline: rewrite only the baseline object, print the edit, or rewrite the
  whole config:** print. baton never writes the config. Picked by the owner.
- **Counted files: tracked source files with tests, without tests, or every tracked text
  file:** tracked source files, tests included. Orasenda's 2,400 lines of tests in one file
  were the problem. Picked by the owner.
- **Applicability: always, always with baton skipping it, or only with source files:** always.
  baton dogfoods it with a baseline. Picked by the owner.
- **Layering: guide sections with lint recipes, new kind-profile files, or size only:** a
  Layout section per stack guide. The repo's linter and `cargo tree` enforce it, each with a
  fixture. Picked by the owner.
- Process: #185 (worktree config) is filed as a bug, and this spec's CLI tasks depend on it.
  Picked by the owner.

Everything else below that the owner didn't pick is marked **(author's call)**.

## Users & permissions
n/a: no roles. Whoever can edit `.baton/config.json` sets the limit and the baseline. Raising
either shows in the diff, and `baton:verify` forbids raising them to get green. Only the owner
approves a raise.

## Tenancy & localization
n/a. CLI output and guides stay English, like the rest of baton.

## Domain model
- **Size limit:** `structure.maxLines`, the most lines a counted file may have. Default 500.
- **Counted file:** a file `baton structure` measures (Goal 2).
- **Line count:** the number of `\n` characters, plus one when the file is non-empty and doesn't
  end with `\n`. This matches `wc -l` except for a missing final newline (author's call). An
  empty file has 0 lines.
- **Baseline:** `structure.baseline`, a map from a repo-relative POSIX path to the exact line
  count the file is allowed to keep. Entries are removed when a file reaches the limit, and
  lowered when it shrinks. Only a hand edit adds or raises one.
- **Exclusion:** a glob in `structure.exclude` for generated or vendored code that isn't
  counted.

A baseline entry's state, checked in this order (the first match wins):

| State | Condition | Finding |
|---|---|---|
| not counted | the path is untracked, missing, excluded, not a regular file, or has no source extension | `in structure.baseline but not counted (<why>). Remove its entry.` |
| under the limit | lines ≤ `maxLines` | `<n> lines, under the <max>-line limit. Remove its structure.baseline entry.` |
| grew | lines > entry | `<n> lines, baseline <b>. It grew: split it (stacks/common.md, Size and structure).` |
| shrank | lines < entry | `<n> lines, baseline <b>. It shrank: set structure.baseline["<path>"] to <n>.` |
| held | lines = entry | none |

## Interfaces

### Config (`.baton/config.json`)
New top-level key `structure`, optional:

| Field | Type | Default | Rule |
|---|---|---|---|
| `maxLines` | integer | `500` | ≥ 1 |
| `exclude` | array of strings | `[]` | non-empty strings; globs matched against the repo-relative POSIX path, where `*` and `?` match within one path segment and `**` matches any number of segments |
| `baseline` | object | `{}` | keys are non-empty POSIX paths with no leading `./` or `/`; values are integers ≥ 1 |

Any other key under `structure` is a config error, so a typo such as `maxline` isn't silently
ignored (author's call). `validateConfig` (`cli/lib/config.mjs:114`) reports each problem as
`structure.<key>: <problem>`. A baseline value at or under `maxLines` is not a config error.
`baton structure` reports it (state "under the limit"), so changing the limit never stops other
commands (author's call).

Source extensions, fixed in baton (author's call): `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`,
`.mts`, `.cts`, `.tsx`, `.rs`. These are the stacks baton has guides for. Adding one is a baton
change.

### `baton structure [--json]`
- Reads the config of the checkout it runs in (after #185) and lists files with
  `git ls-files -z` from the top of that checkout. It always checks the whole checkout,
  whatever the current directory or the step's `cwd` (author's call; per-unit runs are spec 4).
- Text output goes to stderr, one `✖` line per finding, sorted by path. The summary is last:
  `structure: <checked> files checked, limit <max>, <entries> in baseline, <n> failures`, where
  `<entries>` is the number of baseline entries, with `no failures` when there are none
  (author's call).
- When any counted file is over the limit and unlisted, a ready-to-paste block follows the
  summary. The adopter decides whether to fix the files or record them (author's call):

```text
To record these instead of fixing them (needs the owner's approval), add to structure.baseline:
  "src/tray.rs": 612
```

- `--json` prints to stdout
  `{ ok, maxLines, checked, files: [{ path, lines, baseline, state }] }`. `files` holds every
  counted file over the limit and every baseline entry. `state` is one of `unlisted`,
  `not-counted`, `under-limit`, `grew`, `shrank` or `held`; `lines` is `null` for
  `not-counted` (author's call).
- Exit 0 with no findings, 1 with any. Config and git errors exit as other baton errors do.
- The command lives in `cli/lib/structure.mjs`: pure functions for counting, matching and
  classifying, plus a thin runner. `cli/baton.mjs` gets only the dispatch and help line
  (author's call), because it is already over the limit.
- Help line: `structure [--json]   Check source files against the size limit and baseline`.

### Gate applicability (`cli/lib/gates.mjs`)
`structure: () => 'always'`. Spec 1's Applicability row "never in this spec. Spec 2 adds
`structure`" is now true. The doctor finding text is unchanged from spec 1.

### `stacks/common.md`
"Size heuristics" becomes "Size and structure":
- **File size is a rule.** Every counted file stays within `structure.maxLines` (500 by
  default), tests included. Generated code is excluded in config, never by renaming it. The
  `structure` gate enforces it. Files already over the limit live in the baseline, which only
  shrinks.
- **A refactor PR moves code or changes it, never both.** A move-only diff is reviewable
  because nothing in it changes behavior.
- **Organize by feature, not by file type.** Shared code is promoted once a second feature
  needs it. Dependencies point one way. Each stack's Layout section says how that is enforced.
- **Structure is added on a trigger, not predicted** (the table from #137 §6, minus the gate-time
  row, which belongs to spec 4's units):

| Trigger | Change |
|---|---|
| A module has more than one part | It becomes a folder |
| A feature has three or more files of one kind | A subfolder appears (`components/`, `hooks/`, `model/`, `api/`) |
| A second feature needs the code | It moves to a shared module in the PR that needs it |
| A task would push a file past the limit | That task includes the split and owns the new sibling files |
| A second adapter needs the use cases (CLI, MCP server, another window) | Service logic moves out of the framework crate or package |

- Function size, nesting and "one concept per file" stay prompts to look, as today.

The thresholds are fixed in the guide, not configurable. They decide when to look, not a
gate (author's call).

### Stack guide Layout sections
Each section gives the layout, the layer direction and how it is enforced. An enforcing lint
rule has a fixture: a file that breaks the rule, plus a check that the linter fails on it
(#137 §3.7). The fixture is a recipe in the guide that adopters copy, not files baton ships
or tests. Picked by the owner. The recipe covers:
- keeping the fixture out of the normal lint run;
- a small script that lints the fixture and fails if the linter passes, run as its own
  `validate` step covering `structure`, beside the `baton structure` step;
- listing the fixture folder in `structure.exclude`.

The guide names the rule in both Biome and ESLint, since spec 3 picks the tool.
- `rust.md`, new "Layout":
  - a workspace grows on the triggers into `core` (domain, no I/O), `store` (the only crate
    with the database; its public API exposes no driver types), `service` (use cases, no
    UI-framework or web-framework types) and thin adapters (Tauri, Axum, CLI, MCP) that hold
    no rules;
  - a module becomes `foo/mod.rs` once it has parts, with tests in `foo/tests.rs` or `tests/`
    beside it;
  - `cargo tree -p <service> -e normal -i <framework>` failing to find the framework is the
    boundary check, as a `validate` step covering `structure`. It runs alongside the
    `baton structure` step, never instead of it. `doctor` only checks that some step covers the
    gate, so the guide says both are needed (author's call; no doctor rule for it).
- `typescript.md`, new "Layout": folders by feature, one alias per layer, generated code in one
  excluded folder, tests beside the file and split by behavior
  (`<File>.<behavior>.test.ts`), and a restricted-imports rule per layer (Biome
  `noRestrictedImports` overrides, or ESLint `no-restricted-imports` /
  `import/no-restricted-paths`).
- `react.md`, new "Layout": `app/`, `features/<name>/`, `domain/`, `shared/` (and `surfaces/`
  per window in a desktop app). Imports go only downward (`app → features → domain →
  shared`), and features never import each other. It is enforced through the TypeScript
  Layout rule.
- `node.md`, "Structure" extended: `src/modules/<name>/{routes,service,repository,schema}`,
  thin entry points (argument or request parsing only), config isolated in one module.
  Modules meet only through their service. This is enforced with the TypeScript Layout rule,
  or with the same restricted-imports rule in plain JavaScript.

### Skills and reviewers
- `skills/plan/SKILL.md` step 2: a task that would push a file past `structure.maxLines`
  includes the split, owns the new sibling files, and says so in its Owns line.
- `skills/verify/SKILL.md` step 2, beside "don't weaken a test": never raise
  `structure.maxLines`, add or raise a `structure.baseline` entry, or add a
  `structure.exclude` glob to get green. If that seems the only way, stop and ask the owner.
  Lowering or removing an entry, as `baton structure` prints, is expected.
- `reviewers/code-quality.md` item 7 becomes: business logic placed in an adapter (a handler,
  a Tauri command, a React component), an import across layers that no lint rule covers, and a
  refactor that both moves and changes code. File size is dropped from the list: the guard
  checks it.

### baton's own repo
- `validate` gains `{ "name": "structure", "gates": ["structure"], "run": "node cli/baton.mjs structure" }`
  after `lint`. It runs the checkout's CLI, like CI does, so the installed plugin's version
  doesn't matter (author's call).
- `structure.baseline` lists every counted file over 500 lines, with its count when the task
  runs. No `maxLines` or `exclude`: the defaults fit.
- Consequence: after this lands, a task that adds lines to `cli/baton.mjs` or to a listed test
  file fails the gate. It has to split the file first, or the owner raises the entry. Spec 3's
  plan must account for that.
- Between the task that makes `structure` apply and this one, baton's own `baton doctor`
  reports the gap (spec 1's Goal 9). CI doesn't run `doctor`, so nothing blocks. The plan keeps
  that window short.

## Behavior & edge cases
- Not in a git repository: the usual `Not inside a git repository` error.
- A tracked file deleted in the working tree, a symlink or a submodule entry is not counted.
  A baseline entry for one is reported as not counted (`missing`, `not a regular file`).
- An untracked new file is not counted until it is added. `baton done` and CI run on commits,
  so nothing untracked reaches a PR (author's call).
- Paths with spaces or non-ASCII characters: `-z` output, matched exactly, printed as-is.
- CRLF files: lines are counted by `\n`, so the count is the same.
- A large repo: one read per counted file and no caching. Files are read one by one and only
  their newlines are counted.
- `baton` missing on `PATH` when a step runs `baton structure`: the step fails like any missing
  command (exit 127, shown by `verify`).
- In CI, `npm exec --package=@jcioriente/baton@<version> -- baton verify --stage ci` puts the
  package's `baton` on `PATH` for the steps it runs (checked on 2026-11-17 with the local
  package: `command -v baton` resolves to npm's `.bin`).
- The command runs in milliseconds, so a repo may add `commit` to the step's stages. baton's
  own step keeps the default stages (author's call).

## Data & migrations
No migration. A config without `structure` gets the defaults, and its first `baton doctor` adds
one finding (`structure` applies) until the repo adds the step or skips the gate. That is the
intended adoption path (#137 §9: classify each missing gate by running it once).

## Testing strategy
`baton verify` covers all of it. No paid evals: the skill changes add rules but don't change
trigger wording.
- `cli/test/structure.test.mjs` (new, unit):
  - line counting (empty, no final newline, CRLF);
  - glob matching (`*`, `?`, `**` at start, middle and end; no match across `/` for `*`);
  - classification for each row of the baseline state table, and for an unlisted file over the
    limit, at the limit and under it;
  - the order rules (not counted before under the limit).
- `cli/test/structure-cli.test.mjs` (new, integration, black-box runs of `baton.mjs` in
  temporary git repos):
  - exit 0 and the summary with no findings;
  - each finding's line, and exit 1;
  - the paste block;
  - `--json` shape;
  - untracked, excluded, non-source, deleted and symlinked files not counted;
  - a test file over the limit counted;
  - run from a subdirectory checks the whole checkout;
  - no file in the repo changed after a run (Goal 4).
- `cli/test/config.test.mjs`: each `structure` rule, an unknown key, defaults when absent, a
  baseline value under the limit accepted.
- `cli/test/gates.test.mjs`: `structure` applies with `always` in a fixture with no stacks and
  no manifests.
- `cli/test/features.test.mjs`: `doctor` reports the `structure` gap, and not once a step
  covers it or `gates.skip` lists it.
- Each test must fail when the code it covers is removed (the lesson from #174, #177, #178 and
  #180).
- Guides and skills: no tests beyond `make plugin-validate`. Review checks them against this
  spec.

## Decisions
- No new ADR. Only this spec depends on where the size baseline lives and on the exact ratchet.
  If spec 3's baselines for other gates follow the same shape, that spec records it as an ADR
  (author's call). The reasoning is in the FAQ.
- `CONTEXT.md` gains **Size limit**, **Counted file** and **Baseline**. Baseline is defined
  generally: a committed record of existing violations that only shrinks. `structure.baseline`
  is its first instance.

## FAQ
### Why does `baton structure` exist when the gate catalog says steps call the repo's own recipes?
ADR-0003 has steps call the repo's runner so the tools stay in the repo. The size guard isn't a
third-party tool: without baton every repo would write and test its own script (#137 §3.7).
A repo can still wrap it in a recipe (`make structure: baton structure`).

### Why must a shrinking file update its entry?
With a ceiling, a file that loses 200 lines can grow them back unnoticed. The baseline is meant
to only go down, and an exact count makes every change to it visible in a diff.

### Why does baton print the edit instead of writing it?
`.baton/config.json` is hand-written (baton's own keeps one-line steps), and rewriting it
would reformat it. A printed edit also keeps raising an entry a deliberate act. Picked by the
owner.

### Why count tests?
Long test files hide what they test and get no review attention. Orasenda's worst file was
2,400 lines of tests. Splitting tests by behavior is in the TypeScript and Rust Layout
sections.

### Why fixed source extensions?
The guard enforces the guides, and baton has guides only for these languages. Files in other
languages aren't counted until baton has a guide for that language.

## Open questions
None.

## Implementation status
- [ ] plan
