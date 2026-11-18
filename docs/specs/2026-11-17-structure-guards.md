# Engineering standard, layout and size: the `structure` gate — Spec

- Status: approved 2026-11-17
- Date: 2026-11-17
- Owner: Arnold Gandarillas
- Related: #136 (this spec), #137 (umbrella; this is its spec 2 of 4), #185 (blocks the CLI
  tasks), [gates core spec](2026-11-16-gates-core.md),
  [ADR-0003](../adr/0003-validate-is-the-gate-list.md)

## TL;DR
- New command `baton structure`. It fails when a source file is longer than the size limit
  (500 lines by default, tests included) and isn't on the allowlist.
- The limit, the exclusions for generated code and the allowlist live in `.baton/config.json`
  under `structure`. The allowlist only shrinks: a listed file must match its recorded count
  exactly, and baton prints the edit but never writes it.
- The `structure` gate now applies in every repo, so `baton doctor` reports a repo with no step
  for it. baton's own repo adds the step and an allowlist for its five long files.
- The stack guides get layout rules:
  - `common.md` turns its size prompt into a rule and adds the structure triggers;
  - `rust.md`, `react.md`, `typescript.md` and `node.md` give each stack's layout and layer
    direction. The repo's linter or cargo-deny enforces that direction, not baton.
- `baton:plan`, `baton:verify` and the code-quality reviewer learn the rules:
  - a file that would cross the limit is split in the same PR, as a move-only first commit;
  - nobody raises the allowlist to get green;
  - review checks what the guard can't see, including a raised allowlist.

## Change in a nutshell
A repo adds one step and, if it already has long files, an allowlist:

```json
"validate": [
  { "name": "structure", "gates": ["structure"], "run": "baton structure" }
],
"structure": {
  "maxLines": 500,
  "exclude": ["src/gen/**"],
  "allowlist": { "src/session.rs": 3789 }
}
```

A task that adds a 612-line file and shortens `session.rs` gets:

```text
$ baton structure
✖ src/session.rs: 3701 lines, allowlisted at 3789. It shrank: set structure.allowlist["src/session.rs"] to 3701.
✖ src/tray.rs: 612 lines, over the 500-line limit. Split it in this PR (stacks/common.md, Size and structure).
structure: 214 files checked, limit 500, 1 allowlisted, 2 failures
```

It exits 1. The agent splits `tray.rs` in a move-only commit and lowers the `session.rs` entry
by hand. `baton verify` runs the step like any other, locally and in CI.

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
   - A counted file is over `maxLines` and not on the allowlist.
   - An allowlisted file's count differs from its entry while still over the limit.
   - An allowlisted file is at or under the limit.
   - An allowlisted path is not a counted file.
2. A counted file is a regular file in the working tree, tracked or untracked but not ignored by
   git. It has a source extension (Interfaces) and isn't matched by `structure.exclude`. Test
   files count.
3. `.baton/config.json` accepts `structure.maxLines`, `structure.exclude` and
   `structure.allowlist`. `baton` refuses a config with a wrong type or an unknown key under
   `structure`, and names the key. A config without `structure` behaves as
   `{ "maxLines": 500, "exclude": [], "allowlist": {} }`.
4. `baton structure` never writes a file. Every finding says which edit fixes it.
5. `applicableGates` returns `structure` for every repo, with the reason `always`. So
   `baton doctor` reports `gate 'structure' applies (always) but no step covers it and
   gates.skip doesn't list it` until a step covers it or `gates.skip` lists it.
6. baton's own repo:
   - has a `structure` step;
   - lists in `structure.allowlist` every file over 500 lines when the dogfood task runs
     (today: `cli/baton.mjs` and four test files);
   - `baton doctor` reports no gate gaps and `baton verify` passes.
7. The guides say:
   - `stacks/common.md`: file size is a rule enforced by the `structure` gate. A file that
     would cross the limit is split in the same PR, as a move-only first commit. A refactor
     PR, and that split commit, moves code or changes it, never both. Structure is added on the
     triggers in Interfaces, not predicted. Function size stays a prompt.
   - `stacks/rust.md`, `react.md` and `typescript.md` gain a Layout section, and `node.md`'s
     Structure section is extended. Each gives the layout, the layer direction and the lint
     rule or check that enforces it. Each lint rule comes with a recipe for a fixture that must
     fail.
8. The skills and reviewers say:
   - `baton:plan`: check the line counts of the files a task will grow. A task that would push
     one past the limit includes the split and owns the new sibling files. Allowlist entries
     are exempt from file ownership;
   - `baton:verify`: never raise `maxLines`, add or raise an allowlist entry, or add an
     `exclude` to get green. The one exception is a purely mechanical change, such as a
     formatter or codegen upgrade, with the owner's approval stated in the PR;
   - `baton:implement`: place new files by the stack's Layout section, and split before
     growing a file past the limit;
   - `reviewers/code-quality.md` item 7 changes:
     - drop the size check, which the guard now does;
     - add logic placed in an adapter, and an import that crosses a layer no lint rule covers;
     - add a split commit that also changes code;
     - add a diff that adds or raises `structure.allowlist`, `maxLines` or `exclude` without
       the owner's approval noted.

## Non-goals
- A baton import-direction checker. Layer direction is the linter's job (restricted imports)
  and cargo-deny's, per the guides. Picked by the owner.
- Choosing the linter for layer rules (Biome or ESLint): spec 3's presets. The guides name the
  rule in both.
- Kind profiles (web app, Rust service, desktop, ...) and per-unit gates in a monorepo: spec 4.
  The Layout sections are per stack.
- A command that writes the allowlist. Picked by the owner: print, don't write.
- Allowlists or baselines for other gates (lint, dead code), and the full gate-integrity
  review (every loosened check in a diff): later #137 specs. This spec adds only the reviewer
  check for its own allowlist, limit and exclusions.
- Layer-rule fixtures that baton ships and tests. The guides give the recipe. Picked by the
  owner.
- `baton init` suggesting a `structure` step: spec 3, with the rest of `init`'s catalog
  suggestions. Until then a new repo's `doctor` reports the gap. Picked by the owner.
- Splitting baton's own long files. Paying down an allowlist is planned backlog work
  (#137 §9.5).
- Reading config from the current worktree: #185, a bug fix this spec's CLI tasks depend on.

## Approaches
Settled with the owner on 2026-11-17 before this was written:
- **Guard form: built-in command, a script template per repo, or a recipe in the guides:**
  built-in. It is tested once in baton, which covers #137 §3.7 ("custom guards are tested"),
  and it works for any stack. The cost is that steps need `baton` on `PATH`. The plugin's
  `bin/` and CI's `npm exec` already provide it. Picked by the owner.
- **Name: `baton size`, `baton structure` or `baton check size`:** `baton structure`, matching
  the gate. Picked by the owner.
- **Where the limit and the allowlist live: limit in config plus a separate file, all in
  config, or a fixed 500 with only a list:** all in `.baton/config.json`, under `structure`.
  Picked by the owner.
- **Ratchet: exact count or ceiling:** exact. A listed file must match its entry, so every
  shrink is recorded and the allowlist only goes down. Picked by the owner.
- **Writing the allowlist: rewrite only that object, print the edit, or rewrite the whole
  config:** print. baton never writes the config. Picked by the owner.
- **Counted files: source files with tests, without tests, or every text file:** source files,
  tests included. Orasenda's 2,400 lines of tests in one file were the problem. Picked by the
  owner.
- **Applicability: always, always with baton skipping it, or only with source files:** always.
  baton dogfoods it with an allowlist. Picked by the owner.
- **Layering: guide sections with lint recipes, new kind-profile files, or size only:** a
  Layout section per stack guide. The repo's linter and cargo-deny enforce it. Picked by the
  owner.
- **Fixtures: a recipe in the guide, files baton ships and tests, or Biome fixtures only:** a
  recipe. Picked by the owner (from the builder check).
- **`init` suggesting the step now or in spec 3:** spec 3. Picked by the owner (from the
  builder check).
- **Split: its own move-only task before the feature task, or in the same PR:** the same PR,
  so no file is left over the limit and debt doesn't pile up. Picked by the owner (from the
  architect review). The split is the PR's first, move-only commit, and the reviewer checks
  that commit on its own before merge. Squash merge folds it into one commit on main (author's
  call).
- **Mechanical growth (formatter, codegen upgrade): an exception with the owner's approval, or
  none:** the exception. Picked by the owner (from the architect review).
- **Rust module folders: `foo.rs` plus `foo/`, or `foo/mod.rs` (#136):** `foo.rs` plus `foo/`,
  the idiom since the 2018 edition. Picked by the owner (from the architect review).
- **Field name: `structure.allowlist` or `structure.baseline`:** `allowlist`, #136's own word.
  "Baseline" stays the name of `baton start`'s validation run (`cli/baton.mjs:438`). Picked by
  the owner (from the architect review).
- Process: #185 (worktree config) is filed as a bug, and this spec's CLI tasks depend on it.
  Picked by the owner.

Everything else below that the owner didn't pick is marked **(author's call)**.

## Users & permissions
n/a: no roles. Whoever can edit `.baton/config.json` sets the limit and the allowlist. Raising
either shows in the diff, `baton:verify` forbids it to get green, and the code-quality reviewer
flags it unless the owner's approval is noted. Only the owner approves a raise.

## Tenancy & localization
n/a. CLI output and guides stay English, like the rest of baton.

## Domain model
- **Size limit:** `structure.maxLines`, the most lines a counted file may have. Default 500.
- **Counted file:** a file `baton structure` measures (Goal 2).
- **Line count:** the number of `\n` characters, plus one when the file is non-empty and doesn't
  end with `\n`. This matches `wc -l` except for a missing final newline (author's call). An
  empty file has 0 lines.
- **Allowlist:** `structure.allowlist`, a map from a repo-relative POSIX path to the exact line
  count the file is allowed to keep. An entry is removed when its file reaches the limit, and
  lowered when the file shrinks. Only a hand edit adds or raises one.
- **Exclusion:** a glob in `structure.exclude` for generated or vendored code that isn't
  counted.

An allowlist entry's state, checked in this order (the first match wins):

| State | Condition | Finding |
|---|---|---|
| not counted | the path is missing, ignored by git, excluded, not a regular file, under `.worktrees/`, not listed by git (inside a nested repository), or has no source extension | `on structure.allowlist but not counted (<why>). Remove its entry.` |
| under the limit | lines ≤ `maxLines` | `<n> lines, under the <max>-line limit. Remove its structure.allowlist entry.` |
| grew | lines > entry | `<n> lines, allowlisted at <b>. It grew: split it in this PR (stacks/common.md, Size and structure).` |
| shrank | lines < entry | `<n> lines, allowlisted at <b>. It shrank: set structure.allowlist["<path>"] to <n>.` |
| held | lines = entry | none |

A counted file over the limit and not on the allowlist (state `unlisted`):
`<n> lines, over the <max>-line limit. Split it in this PR (stacks/common.md, Size and structure).`

## Interfaces

### Config (`.baton/config.json`)
New top-level key `structure`, optional:

| Field | Type | Default | Rule |
|---|---|---|---|
| `maxLines` | integer | `500` | ≥ 1 |
| `exclude` | array of strings | `[]` | non-empty strings; globs matched against the repo-relative POSIX path, where `*` and `?` match within one path segment and `**` matches any number of segments |
| `allowlist` | object | `{}` | keys are non-empty POSIX paths with no leading `./` or `/`; values are integers ≥ 1 |

Any other key under `structure` is a config error, so a typo such as `maxline` isn't silently
ignored (author's call). `validateConfig` (`cli/lib/config.mjs:114`) reports each problem as
`structure.<key>: <problem>`. An allowlist value at or under `maxLines` is not a config error.
`baton structure` reports it (state "under the limit"), so changing the limit never stops other
commands (author's call).

Source extensions, fixed in baton (author's call): `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`,
`.mts`, `.cts`, `.tsx`, `.rs`. These are the stacks baton has guides for. Adding one is a baton
change.

### `baton structure [--json] [--suggest-allowlist]`
- Reads the config of the checkout it runs in (after #185). It lists files with
  `git ls-files -z --cached --others --exclude-standard` from the top of that checkout, so a
  new file counts before it is committed (author's call). It always checks the whole checkout,
  whatever the current directory or the step's `cwd` (author's call; per-unit runs are spec 4).
- Text output goes to stderr, one `✖` line per finding, sorted by path. The summary is last
  (author's call):
  `structure: <checked> files checked, limit <max>, <k> allowlisted, <n> failures`. It says
  `no failures` when there are none. `<k>` is the number of allowlist entries. When tracked or
  untracked files were skipped for their extension, the summary adds
  `, <m> files not counted (no guide for their extension)`, so a repo in another language sees
  that the gate checks nothing.
- `--suggest-allowlist` prints, after the summary, the entries that would record every unlisted
  file over the limit. It is for adopting the gate in an existing repo. It changes nothing else:
  the run still fails and nothing is written (author's call). Without the flag, an unlisted file
  only gets its "split it" line.

```text
To record these instead of splitting them (needs the owner's approval), add to structure.allowlist:
  "src/tray.rs": 612
```

- `--json` prints to stdout
  `{ ok, maxLines, checked, notCounted, files: [{ path, lines, allowlisted, state }] }`.
  `files` holds every counted file over the limit and every allowlist entry. `state` is one of
  `unlisted`, `not-counted`, `under-limit`, `grew`, `shrank` or `held`. `lines` is `null` for
  `not-counted`, and `allowlisted` is `null` for `unlisted` (author's call).
- Exit 0 with no findings, 1 with any. Config and git errors exit as other baton errors do.
- The command lives in `cli/lib/structure.mjs`: pure functions for counting, matching and
  classifying, plus a thin runner. `cli/baton.mjs` gets only the dispatch and help line
  (author's call), because it is already over the limit.
- Help line:
  `structure [--json] [--suggest-allowlist]   Check source files against the size limit and allowlist`.

### Gate applicability (`cli/lib/gates.mjs`)
`structure: () => 'always'`. Spec 1's Applicability row "never in this spec. Spec 2 adds
`structure`" is now true. The doctor finding text is unchanged from spec 1.

### `stacks/common.md`
"Size heuristics" becomes "Size and structure":
- **File size is a rule.** Every counted file stays within `structure.maxLines` (500 by
  default), tests included. Generated code is excluded in config, never by renaming it. The
  `structure` gate enforces it. Files already over the limit are on the allowlist, which only
  shrinks.
- **Split in the same PR.** A change that would push a file past the limit splits it in the
  same PR, so no file stays over the limit. The split is the PR's first commit and only moves
  code. The behavior change comes after it.
- **Move or change, never both.** A refactor PR, and a split commit, only moves code or only
  changes it. A move-only diff is reviewable because nothing in it changes behavior
  (`git diff --color-moved` shows it).
- **Organize by feature, not by file type.** Shared code is promoted once a second feature
  needs it. Dependencies point one way. Each stack's Layout section says how that is enforced.
- **Structure is added on a trigger, not predicted.** This is the table from #137 §6, minus the
  gate-time row, which belongs to spec 4's units:

| Trigger | Change |
|---|---|
| A module has more than one part | It becomes a folder |
| A feature has three or more files of one kind | A subfolder appears (`components/`, `hooks/`, `model/`, `api/`) |
| A second feature needs the code | It moves to a shared module in the PR that needs it |
| A change would push a file past the limit | The same PR splits it first, in a move-only commit |
| A second adapter needs the use cases (CLI, MCP server, another window) | Service logic moves out of the framework crate or package |

- Function size, nesting and "one concept per file" stay prompts to look, as today.

The thresholds are fixed in the guide, not configurable. They decide when to look and aren't
a gate (author's call).

### Stack guide Layout sections
Each section gives the layout, the layer direction and how it is enforced. An enforcing lint
rule has a fixture: a file that breaks the rule, plus a check that the linter fails on it
(#137 §3.7). The fixture is a recipe in the guide that adopters copy, not files baton ships
or tests. Picked by the owner. The recipe covers:
- keeping the fixture out of the normal lint run;
- a small script that lints the fixture and fails if the linter passes. It runs as its own
  `validate` step covering `structure`, beside the `baton structure` step, never instead of it;
- listing the fixture folder in `structure.exclude`.

The guide names the directional rule for both linters, since spec 3 picks the tool. Biome
uses `overrides` per layer folder with `noRestrictedImports` patterns. ESLint uses
`import/no-restricted-paths` zones, or `eslint-plugin-boundaries`. Plain `no-restricted-imports`
can't say "from layer X", so it isn't the directional rule (author's call).
- `rust.md`, new "Layout":
  - a workspace grows on the triggers into four kinds of crate:
    - `core`: the domain, with no I/O;
    - `store`: the only crate with the database, whose public API exposes no driver types;
    - `service`: the use cases, with no UI-framework or web-framework types;
    - thin adapters (Tauri, Axum, CLI, MCP) that hold no rules;
  - a module with parts is `foo.rs` plus a `foo/` folder, never `foo/mod.rs`. Clippy's
    `mod_module_files` lint enforces it. Picked by the owner. Tests go in `foo/tests.rs` or
    `tests/`;
  - the crate boundary is enforced by cargo-deny, which `rust.md` already makes the main gate:
    `[bans]` with `deny = [{ name = "tauri", wrappers = ["app"] }]` (or the web framework and
    its adapter crate). It fails on a positive match, so a typo in a crate name doesn't pass by
    accident, as an inverted `cargo tree` check would. The step that runs it lists `structure`
    beside `audit` (author's call).
- `typescript.md`, new "Layout":
  - folders by feature;
  - one import alias per layer, preferring package.json `imports` (`#domain/*`) over tsconfig
    `paths`, since subpath imports also resolve at runtime without a bundler (author's call);
  - generated code in one excluded folder;
  - tests beside the file and split by behavior (`<File>.<behavior>.test.ts`);
  - the directional rule above.
- `react.md`, new "Layout":
  - `app/`, `features/<name>/`, `domain/` and `shared/`, plus `surfaces/` per window in a
    desktop app;
  - imports go only downward (`app → features → domain → shared`), and features never import
    each other;
  - a feature is imported only through its one public entry. There are no other barrel files
    (`stacks/typescript.md` already forbids them);
  - enforced through the TypeScript Layout rule.
- `node.md`, "Structure" extended:
  - `src/modules/<name>/{routes,service,repository,schema}`;
  - thin entry points that only parse arguments or requests;
  - config isolated in one module;
  - modules meet only through their service, enforced with the TypeScript Layout rule or the
    same rule in plain JavaScript.

### Skills and reviewers
- `skills/plan/SKILL.md` step 2:
  - before cutting a task, check the line counts of the files it will grow (`wc -l`, or
    `baton structure --json` for files already over);
  - a task that would push a file past `structure.maxLines` includes the split as its first,
    move-only commit, and its Owns line lists the new sibling files;
  - `structure.allowlist` entries are exempt from file ownership. Two tasks may each lower or
    drop their own entries. A merge conflict there is resolved by rerunning `baton structure`
    and taking its numbers (author's call).
- `skills/verify/SKILL.md` step 2, beside "don't weaken a test":
  - never raise `structure.maxLines`, add or raise a `structure.allowlist` entry, or add a
    `structure.exclude` glob to get green;
  - the one exception is a purely mechanical change (formatter, codegen, a `baton:deps`
    upgrade) that adds lines. It may raise entries with the owner's approval stated in the PR;
  - anything else that seems to need a raise: stop and ask the owner. Lowering or removing an
    entry, as `baton structure` prints, is expected.
- `skills/implement/SKILL.md`: place new files by the stack's Layout section, and split a file
  in a move-only first commit when a change would push it past the limit (author's call: one
  line each, so the implementer meets the rule before verify does).
- `reviewers/code-quality.md` item 7 checks five things:
  - business logic placed in an adapter (a handler, a Tauri command, a React component);
  - an import across layers that no lint rule covers;
  - a split commit that also changes code (review the split commit on its own);
  - a refactor PR that both moves and changes code;
  - a diff that adds or raises a `structure.allowlist` entry, raises `maxLines` or adds an
    `exclude` without the owner's approval noted in the task or PR.

  File size itself is dropped from the list: the guard checks it.

### baton's own repo
- `validate` gains `{ "name": "structure", "gates": ["structure"], "run": "node cli/baton.mjs structure" }`
  after `lint`. It runs the checkout's CLI, like CI does, so the installed plugin's version
  doesn't matter (author's call).
- `structure.allowlist` lists every counted file over 500 lines, with its count when the task
  runs. No `maxLines` or `exclude`: the defaults fit.
- Consequence: after this lands, a task that adds lines to `cli/baton.mjs` or to a listed test
  file splits it in the same PR. Spec 3's plan must account for that.
- Between the task that makes `structure` apply and this one, baton's own `baton doctor`
  reports the gap (spec 1's Goal 9). CI doesn't run `doctor`, so nothing blocks. The plan keeps
  that window short.

## Behavior & edge cases
- Not in a git repository: the usual `Not inside a git repository` error.
- A file deleted in the working tree, a symlink, or a submodule entry is not counted. An
  allowlist entry for one is reported as not counted (`missing`, `not a regular file`).
- An ignored file (`.gitignore`, `.git/info/exclude`) is not counted, even when it has a source
  extension, such as a build output folder.
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
- An allowlist-only edit to `.baton/config.json` still triggers the full reviewer set
  (`WORKFLOW_FILES` in `cli/lib/config.mjs`). That is unchanged: a config edit can loosen a gate
  (author's call).

## Data & migrations
No migration. A config without `structure` gets the defaults, and its first `baton doctor` adds
one finding (`structure` applies) until the repo adds the step or skips the gate. That is the
intended adoption path (#137 §9: classify each missing gate by running it once). The release
notes for the version that ships this say so (author's call).

## Testing strategy
`baton verify` covers all of it. No paid evals: the skill changes add rules but don't change
trigger wording.
- `cli/test/structure.test.mjs` (new, unit):
  - line counting (empty, no final newline, CRLF);
  - glob matching (`*`, `?`, `**` at start, middle and end; no match across `/` for `*`);
  - classification for each row of the allowlist state table, and for an unlisted file over
    the limit, at the limit and under it;
  - the order rules (not counted before under the limit).
- `cli/test/structure-cli.test.mjs` (new, integration, black-box runs of `baton.mjs` in
  temporary git repos):
  - exit 0 and the summary with no findings;
  - each finding's line, and exit 1;
  - `--suggest-allowlist` prints the block and still exits 1. Without it, no block;
  - `--json` shape;
  - an untracked file over the limit counted;
  - ignored, excluded, non-source, deleted and symlinked files not counted, and the
    not-counted count in the summary;
  - a test file over the limit counted;
  - a run from a subdirectory checks the whole checkout;
  - no file in the repo changed after a run (Goal 4).
- `cli/test/config.test.mjs`: each `structure` rule, an unknown key, defaults when absent, an
  allowlist value under the limit accepted.
- `cli/test/gates.test.mjs`: `structure` applies with `always` in a fixture with no stacks and
  no manifests.
- `cli/test/features.test.mjs`: `doctor` reports the `structure` gap, and not once a step
  covers it or `gates.skip` lists it.
- Each test must fail when the code it covers is removed (the lesson from #174, #177, #178 and
  #180).
- Guides and skills: no tests beyond `make plugin-validate`. Review checks them against this
  spec.

## Decisions
- No new ADR. Only this spec depends on where the allowlist lives and on the exact ratchet. If
  spec 3's baselines for other gates follow the same shape, that spec records it as an ADR
  (author's call). The reasoning is in the FAQ.
- `CONTEXT.md` gains **Size limit**, **Counted file** and **Allowlist**.

## FAQ
### Why does `baton structure` exist when ADR-0003 has steps call the repo's own recipes?
ADR-0003 has steps call the repo's runner so the tools stay in the repo. The size guard isn't a
third-party tool: without baton, every repo would write and test its own script (#137 §3.7).
A repo can still wrap it in a recipe (`make structure: baton structure`).

### Why must a shrinking file update its entry?
With a ceiling, a file that loses 200 lines can grow them back unnoticed. The allowlist is
meant to only go down, and an exact count makes every change to it visible in a diff.

### Why does baton print the edit instead of writing it?
`.baton/config.json` is hand-written (baton's own keeps one-line steps), and rewriting it
would reformat it. A printed edit also keeps raising an entry a deliberate act. Picked by the
owner.

### Why is the paste block behind a flag?
Agents act on the most concrete text in a command's output. A block that makes the failure go
away, printed on every failure, would teach them to record a file instead of splitting it.

### Why split in the same PR rather than in its own task?
A separate split task leaves the file over the limit until both land, and the feature task waits
on it. The owner chose no debt: the PR that needs the room makes it. The move-only first commit
keeps the split reviewable before merge.

### Why count tests?
Long test files hide what they test and get little review attention. Orasenda's worst file was
2,400 lines of tests. Splitting tests by behavior is in the TypeScript and Rust Layout
sections.

### Why fixed source extensions?
The guard enforces the guides, and baton has guides only for these languages. Files in other
languages aren't counted until baton has a guide for that language, and the summary says how
many were skipped.

## Open questions
None.

## Implementation status
- [x] plan: [docs/plans/2026-11-17-structure-guards.md](../plans/2026-11-17-structure-guards.md)
- [x] #197 structure core
- [x] #204 `baton structure` command
- [x] #198 guides
- [x] #199 skills and reviewer
- [x] #205 applies always, baton dogfoods it
