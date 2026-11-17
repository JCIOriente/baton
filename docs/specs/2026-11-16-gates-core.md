# Engineering standard, core: gate catalog, config shape and CLI — Spec

- Status: approved 2026-11-16
- Date: 2026-11-16
- Owner: Arnold Gandarillas
- Related: #137 (umbrella; this is its spec 1 of 4), #136 (spec 2), #135 and #134 (spec 3),
  `docs/specs/2026-11-10-decision-points.md` (user's calls vs author's calls)

## TL;DR
- `validate` in `.baton/config.json` becomes the repo's list of **gates**. Each step lists the
  catalog gates it covers, the stages it runs in, and whether it blocks.
- baton ships a fixed **gate catalog** of 17 names. `baton doctor` reports any gate that applies
  to the repo (derived from its stacks) and is neither covered by a step nor skipped with a
  reason.
- `baton verify` is the one entry point, locally and in CI (`baton verify --stage ci`). To make
  that possible, the CLI is published to npm as `@jcioriente/baton`.
- `baton verify`, `start` and `done` report results per gate. Advisory steps run and are
  reported without blocking. A narrowed run (`--only`) is never reported as a gate run.
- Commit-stage steps run from the git hook `baton hooks install` writes. A Claude Code hook
  refuses `git commit --no-verify`.
- baton's own repo moves to the new shape and gains format and lint gates (Biome).

## Change in a nutshell
Today baton's whole gate is one step, so every tool sees only "ci passed or failed":

```json
"validate": [{ "name": "ci", "run": "make ci" }]
```

After this spec, the same checks are separate steps. New ones are added for format and lint,
for the Biome devDependency (install, audit) and for the npm package (pack):

```json
"validate": [
  { "name": "secrets", "gates": ["secrets"], "run": "make secrets" },
  { "name": "install", "gates": ["install"], "run": "npm ci" },
  { "name": "lint", "gates": ["format", "lint"], "run": "make lint" },
  { "name": "audit", "gates": ["audit"], "run": "npm audit --audit-level=high" },
  { "name": "tests", "gates": ["unit-tests", "integration-tests"], "run": "make test" },
  { "name": "plugin", "gates": ["build"], "run": "make plugin-validate" },
  { "name": "pack", "gates": ["publish"], "run": "npm pack --dry-run" }
],
"gates": { "skip": { "unused-deps": "one devDependency (Biome), used by the lint step" } }
```

- `baton verify` runs them in order and stops at the first blocking failure.
- `baton doctor` says which applicable gates nothing covers.
- `baton done` writes the gates that ran into the PR body.
- CI runs `baton verify --stage ci` instead of a separate list.

In general, any repo declares one step per check. Each step calls a recipe of the repo's own
runner (`make`, `just`, a package script) and names the catalog gates it covers.

## Problem
baton can't tell which checks a repo runs. A single `make ci` step hides them, so nothing can
report a missing audit or lint, mark a slow check advisory, or tell a partial run from a full
one (#137, "What happened"). Each repo also keeps a second list for CI, and the two drift
(Orientate's `Makefile` vs its `ci.yml`). Specs 2-4 (layout guards, presets, kind profiles) all
add gates, so the shape they plug into has to exist first.

## Goals / Success criteria
1. A `validate` step can declare `gates`, `stages`, `blocking` and `reason`. `baton` refuses a
   config with an unknown gate name or stage, or with an advisory step that has no reason, and
   names the offending step.
2. A config written before this spec loads and behaves exactly as today: every step blocks and
   runs locally and in CI. `baton doctor` reports each step with no `gates`.
3. `baton doctor` lists every applicable gate (Applicability table) that no step covers and no
   `gates.skip` entry explains, and every step that runs a static gate after a non-static step.
4. `baton verify`:
   - runs the `local` stage by default, or the stage given by `--stage`;
   - continues past a failing advisory step and exits 0 when only advisory steps failed;
   - ends with a per-step summary;
   - prints `Narrowed run (--only <x>): not a gate run.` after an `--only` run, and sets
     `"narrowed": true` in `--json`.
5. `baton start`'s baseline and `baton done`'s gate run the `local` stage as `verify` does. The
   PR body lists the steps that passed, advisory failures, steps that run only in CI and
   skipped gates with their reasons.
6. With at least one `commit`-stage step, `baton hooks install` makes the pre-commit hook run
   `baton verify --stage commit` in linked worktrees.
7. In a baton repo, a Claude Code `Bash` call is refused with a message when it runs
   `git commit` with `--no-verify` or `-n`, or `git push` with `--no-verify`.
8. `npm exec --yes --package=@jcioriente/baton@<version> -- baton verify --stage ci` works on a
   clean runner for any version released after this spec.
9. baton's own repo:
   - declares the steps from "Change in a nutshell";
   - CI runs `node cli/baton.mjs verify --stage ci`;
   - `baton doctor` reports no gate gaps;
   - format and lint (Biome) block.

## Non-goals
- Layout and size rules and their guards (`structure` gate): spec 2, #136.
- Stack presets, the decision brief, which tool runs each gate, and per-gate policy: spec 3,
  with #134 and #135. The policy covers:
  - audit blocking PRs or only the scheduled run;
  - whether an e2e smoke set blocks;
  - coverage;
  - which gates may be advisory at all.
- Units, kinds and monorepos (gates per unit, the root entry point): specs 3-4. In this spec the
  repo is one unit; a step's `cwd` stays the way to run a check in a subdirectory.
- `baton init` suggesting the whole catalog: spec 3. Here it only tags its current suggestions
  with gates.
- Gate-integrity review (spotting loosened checks in a diff), clean-code `gate`/`review` tags,
  baselines that only shrink: later specs under #137.
- Scheduled runs (audit against today's advisories, full e2e): not in any spec yet.

## Approaches
Settled with the owner on 2026-11-16 before this was written:
- **Per-gate steps vs one entry-point step plus a gate map.** The map keeps `make ci` and needs
  no baton in CI. But baton would still see one pass or fail, and the map can drift from the
  script. Per-gate steps let baton report each gate and run advisory steps; the cost is baton in
  CI. Picked by the owner: per-gate steps, with CI running `baton verify --stage ci`.
- **Fixed catalog vs open gate names:** fixed, so `doctor` can tell a gap from a typo. Adding a
  gate is a baton change. Picked by the owner.
- **Which gates apply before kinds exist: derived from stacks, universal only, or all 17:**
  derived from the enabled stacks and the detected manifests, refined by kinds later. Picked by
  the owner.
- **Commit stage and hooks in this spec vs later:** in this spec, because no later spec owns
  them. Picked by the owner.
- **Stage as one field (`"stage": "commit"`) vs an explicit list (`"stages": [...]`):** an
  explicit list, which also allows a commit-only step. Picked by the owner.
- **How CI gets baton: `npx` from a git tag, a GitHub Action, or npm:** publish the CLI to npm.
  Picked by the owner. The npm name is `@jcioriente/baton` (`baton` and `baton-cli` are taken).
  Also picked by the owner.
- **Per-gate policy (audit timing, e2e smoke, coverage) here vs in spec 3:** spec 3, inside the
  decision brief. Picked by the owner.
- **Move baton's own repo to the new shape here:** yes, as the last task, with format and lint
  added. Picked by the owner.
- **Format and lint tool for baton: Biome vs ESLint + Prettier:** Biome. One devDependency
  covers both; type-aware rules don't matter for plain JS. Picked by the owner. Its version comes
  from `baton:deps` when the task runs.

- **Commit hook when `baton` is missing or too old: fail with a hint, record the CLI path at
  install, or warn and skip:** fail with the install or upgrade command. A recorded path goes
  stale on plugin updates, and skipping hides the gate from humans. Picked by the owner (from
  the builder check).

Everything else below that the owner didn't pick is marked **(author's call)**.

## Users & permissions
n/a: no roles. Whoever can edit `.baton/config.json` declares the gates. Who may merge a
change that weakens a gate is a review question (gate integrity, a later spec).

## Tenancy & localization
n/a. CLI output stays English, like the rest of baton.

## Domain model
- **Gate:** a catalog name for a kind of check, such as `lint` or `audit`. A gate is covered by
  the steps that list it, or skipped with a reason.
- **Step:** one entry in `validate` with a command. A step covers one or more gates, runs in one
  or more stages, and is blocking or advisory.
- **Stage:** when a step runs.
  - `commit`: the pre-commit hook.
  - `local`: `baton verify`, `start`'s baseline and `done`.
  - `ci`: `baton verify --stage ci` in CI.
- **Advisory step:** `"blocking": false`. Its failure is reported and doesn't stop the run or
  change the exit code. It always carries a `reason`, which covers why and what would make it
  blocking.
- **Skipped gate:** an applicable gate listed in `gates.skip` with its reason.
- **Narrowed run:** `baton verify --only`. It runs part of a stage and is never reported as a
  gate run.

### Gate catalog
Fixed in `cli/lib/gates.mjs` (new), in this order. The order is how `doctor` checks that
static gates come first; `verify` always runs steps in config order.

| # | Gate | Catches | Static |
|---|---|---|---|
| 1 | `secrets` | committed credentials | yes |
| 2 | `install` | lockfile drift, a second package manager | yes |
| 3 | `format` | any formatting diff | yes |
| 4 | `lint` | lint errors, unused imports and variables, restricted imports | yes |
| 5 | `structure` | file over the size limit, wrong import direction, crate or package boundary | yes |
| 6 | `types` | type or compile errors | yes |
| 7 | `generated` | a committed generated file differs from a fresh run | yes |
| 8 | `migrations` | migrations fail on an empty database; schema and query cache disagree | no |
| 9 | `dead-code` | unused files and exports | yes |
| 10 | `unused-deps` | declared but unused dependencies | yes |
| 11 | `audit` | known advisories, disallowed licences or sources | yes |
| 12 | `unit-tests` | behavior without I/O | no |
| 13 | `integration-tests` | behavior through a real boundary (database, HTTP, IPC, the binary) | no |
| 14 | `build` | production build or package | no |
| 15 | `budget` | bundle size, translation count and similar numbers | no |
| 16 | `e2e` | critical journeys in the real app | no |
| 17 | `publish` | package dry-run, public-API break | no |

Names are kebab-case (author's call). `audit` counts as static: it reads manifests and runs no
project code. `migrations` doesn't: it needs a database.

### Applicability
A gate applies when its row matches (author's call on the exact rules). The rules use what
`detectStacks` and the config already know:

| Gate | Applies when |
|---|---|
| `secrets`, `format`, `lint`, `unit-tests` | always |
| `install`, `audit`, `unused-deps` | a `package.json` with dependencies or devDependencies, or a `Cargo.toml`, at the root or one level down (`detect.mjs` `manifests`) |
| `types` | stack `typescript`, `rust` or `rust-tokio-postgres` enabled |
| `migrations` | stack `postgres` enabled |
| `e2e` | stack `e2e` enabled |
| `build` | stack `react` enabled |
| `publish` | `release.publish` is non-empty |
| `structure`, `generated`, `dead-code`, `integration-tests`, `budget` | never in this spec. Spec 2 adds `structure`; kinds add the rest |

A step may cover a gate that doesn't apply, and that is not a finding.

## Interfaces

### Config (`.baton/config.json`)
A `validate` step:

| Field | Type | Default | Rule |
|---|---|---|---|
| `name` | string | `run` | explicit names are unique within `validate`; unnamed steps may share a `run` (owner's call, so old configs keep loading) |
| `run` | string | required | unchanged |
| `cwd` | string | repo root | unchanged |
| `gates` | array of catalog names | none | non-empty when present; no duplicates |
| `stages` | array of `commit`, `local`, `ci` | `["local", "ci"]` | non-empty; no duplicates |
| `blocking` | boolean | `true` | |
| `reason` | string | none | required and non-empty when `blocking` is `false` |

New top-level key: `"gates": { "skip": { "<gate>": "<reason>" } }`. Keys are catalog names and
reasons are non-empty strings. A skipped gate that a step also covers is a config error,
because the two contradict each other.

`validateConfig` (`cli/lib/config.mjs:122`) reports each problem with the step's index and name,
as it does for `run` today. `setup` steps are unchanged and keep `{ name, run, cwd }`.

### `baton verify [--stage commit|local|ci] [--only <name>] [--json]`
- Runs the steps whose `stages` include the stage (default `local`), in config order.
  - A failing blocking step stops the run, with exit 1.
  - A failing advisory step is reported, and the run continues.
- `--only <x>` keeps the selected steps whose `name` is `x` or whose `gates` include `x`. No
  match is an error naming the stage, and the exit code is 1, as today.
- Output keeps today's per-step lines on stderr (`▶ [verify] name: run`, `✔`/`✖`) and adds a
  summary at the end:

```text
verify (local): 4 passed, 1 advisory failed
  ✔ secrets [secrets]
  ✔ lint [format, lint]
  ✖ api-break [publish] advisory: needs a published baseline first
  ✔ tests [unit-tests, integration-tests]
  ✔ plugin [build]
not in this stage: e2e (ci)
skipped gates: unused-deps (one devDependency (Biome), used by the lint step)
```

  - A step after a blocking failure shows as `· <name> not run`.
  - A narrowed run prints `Narrowed run (--only <x>): not a gate run.` after the summary.
- `--json`: `{ ok, stage, narrowed, results, notInStage, skipped }`.
  - Each `results` entry is `{ name, run, gates, blocking, status, code }`, and `status` is one
    of `passed`, `failed` or `not-run`.
  - `notInStage` holds `{ name, stages }`; `skipped` holds `{ gate, reason }`.

### `baton start`
Its baseline runs the `local` stage the same way. The failure message names the first failing
blocking step, as now. Advisory failures add one line:
`baseline: advisory '<name>' fails (<reason>)`.

### `baton done`
- Runs the `local` stage and refuses to open the PR on a blocking failure, as now.
- `prBody` (`cli/lib/tasks.mjs:71`) takes the full result and writes up to four lines. Each line
  is left out when it would be empty (author's call):

```text
Validated (local): secrets (`make secrets`), lint (`make lint`), tests (`make test`)
Advisory failed: api-break (`just api-check`): needs a published baseline first
CI only: e2e (`just e2e-smoke`)
Skipped gates: unused-deps: one devDependency (Biome), used by the lint step
```

- The release override guard (`overrideFindings`) already checks the body after validation
  lines are added; the new lines come from config names and reasons, so they can't open or
  close a commit override block. A test proves it.

### `baton doctor`
New findings, of kind `gates`:
- `gate '<gate>' applies (<why>) but no step covers it and gates.skip doesn't list it`;
- `step '<name>' covers no gate`;
- `step '<name>' runs <static gates> after '<earlier name>' (<non-static gates>)`. Static gates
  run before code executes (author's call: a finding, never a reorder).

As today, any finding exits 1.

### Session context (`cli/lib/context.mjs:75`)
Each validation line gains its gates and any stage other than the default, for example
`- lint [format, lint] (commit, local, ci): \`make lint\``. Advisory steps end with
`advisory: <reason>`.

### `baton init`
`suggestValidate` (`cli/lib/detect.mjs`) adds `gates` to the steps it already suggests:
- `fmt` → `format`;
- `clippy` → `lint`, `types`;
- `cargo-test` → `unit-tests`, `integration-tests`;
- `typecheck` → `types`;
- `lint` → `lint`;
- `js-test` → `unit-tests`;
- `secrets` → `secrets`.

The `baton:init` skill's CI step offers `templates/ci.yml` (new) and points at the existing
"keep local and CI checks identical" advice. That template:
- runs `npm exec --yes --package=@jcioriente/baton@<version> -- baton verify --stage ci`;
- fills `<version>` with the running plugin's version;
- carries a commented slot for installing the repo's tools.

### Hooks
- `baton hooks install` (`cli/lib/git-guard.mjs:74`) installs a second script beside the
  worktree guard, `<common dir>/baton/commit-gates.sh`. The pre-commit stub calls it after the
  guard. It follows the guard's install rules: hook managers, `core.hooksPath` and husky get the
  line to add, never an edit.
- The script runs only in linked worktrees. It runs `baton verify --stage commit` and fails
  the commit on a blocking failure.
  - It reads the working tree's config, as `verify` always does. With no commit-stage steps,
    `verify` exits 0. An uncommitted config edit can change what runs, but that edit is
    committed with the change and visible in review (author's call). Unlike the worktree
    guard, it doesn't read `HEAD`.
  - `CI=true` exits 0, like the guard.
  - If `baton` isn't on `PATH`, the commit fails with the install command
    (`npm install -g @jcioriente/baton`). A commit gate that silently doesn't run isn't a gate.
    Picked by the owner.
  - If the `baton` found rejects `--stage` (older than this spec), the commit fails with the
    upgrade command. Picked by the owner.
- Upgrading from a hook installed before this spec (author's call):
  - `isOurStub` also accepts the old stub, so rerunning `baton hooks install` rewrites it;
  - hook managers get two lines to add, one per script;
  - `baton doctor` (kind `worktree`, beside the existing guard finding) reports
    `commit-gates` as missing when the config has a commit-stage step and the stub, or a
    manager's config, doesn't call it.
- The step's command decides what it checks (staged files or the tree). baton runs it as
  written.
- `hooks/hooks.json` gains a `PreToolUse` hook on `Bash`, `hooks/no-verify-guard.mjs` (new).
  - It is active whenever the project has `.baton/config.json`, whatever its commit steps, since
    `--no-verify` also skips the worktree guard (author's call).
  - It refuses a command in which a `git commit` segment carries `--no-verify` or a short-option
    cluster containing `n` (`-n`, `-an`), or a `git push` segment carries `--no-verify`. On
    `push`, `-n` is `--dry-run` and is allowed. Text inside quotes doesn't count, so
    `git commit -m "-n"` passes.
  - Segments are split on `;`, `&&`, `||`, `|` and newlines.
  - The message repeats the always-on rule and says to fix the failing gate.

### npm package
- `package.json`:
  - name `@jcioriente/baton`;
  - `private` removed;
  - `publishConfig.access: "public"`;
  - `files` covering `cli/` (minus `cli/test/`) and what the CLI reads at runtime: `templates/`,
    `reviewers/`, `provenance.json`, `hooks/` and `stacks/`. The plan confirms that list by
    grepping `PLUGIN_ROOT` and `import.meta.url` uses.
- The `bin` stays `baton`, and the plugin keeps working from its own checkout.
- `release.publish: ["npm"]`, with the npm jobs from `templates/release/release.yml` copied into
  `.github/workflows/release.yml` as `baton:init` step 6 does.
- The first version is published by hand from the release tag, then the trusted publisher is
  added. `skills/init/SKILL.md` already describes this, and the owner does it.

## Behavior & edge cases
- **Old config, no new fields:** every step blocks and runs locally and in CI. The summary shows
  `[no gate]`, and `doctor` reports it. Nothing else changes.
- **No steps in the stage:** `baton verify --stage commit` with no commit steps prints
  `No validation steps in stage 'commit'.` and exits 0. That matches the no-`validate` case today
  (`cli/baton.mjs:834`).
- **Only advisory failures:** exit 0. The summary and the PR body list them.
- **Advisory step before a blocking one:** it runs. Its failure doesn't stop the run.
- **`--only` matching a step outside the stage:** that step isn't selected, and the
  no-match error lists the steps the stage has.
- **`--only` with `done` or `start`:** not offered. They always run the full local stage.
- **A commit-only step** (`"stages": ["commit"]`): runs only from the hook. `verify` lists it
  under "not in this stage".
- **Hook in the main checkout:** the worktree guard refuses the commit first, and the
  commit-gates script exits 0 there.
- **`baton verify --stage ci` run locally:** allowed. It runs exactly what CI runs.
- **Skip reason with a newline:** a config error, because the PR body writes one line per skip
  (author's call).

## Data & migrations
- There is no data. Configs stay valid: every new field is optional, with the defaults above.
- baton's repo moves to the new shape:
  - split the `Makefile` `ci` target into the recipes the steps call;
  - add `biome.json` and Biome as a devDependency, plus a one-time format-only commit listed in
    `.git-blame-ignore-revs`;
  - add the `install`, `audit` and `pack` steps: `npm ci` runs as a validate step, so the
    `install` gate is checked on every run, and also as a `setup` step, so a task worktree has
    `node_modules` before work starts (author's call);
  - baton's `lint` step runs in `local` and `ci` only, not `commit`. A docs-only worktree from
    `baton worktree add` has no `node_modules`, and its commits shouldn't need `npm ci` first.
    The commit stage is proved by tests, not by baton's own config (author's call);
  - point `ci.yml` at `node cli/baton.mjs verify --stage ci`. baton's CI runs its own checkout's
    CLI, not the published one, so a PR is checked by the code it changes (author's call).
- `make ci` stays as a convenience that runs the same recipes, with a comment saying `validate`
  is the source of truth (author's call).

## Testing strategy
`make ci` (and then `baton verify`) covers all of it. No paid evals are needed: the change is
CLI behavior, and skill trigger wording is unchanged.
- `cli/test/config.test.mjs` (new, unit), for `validateConfig`:
  - each new rule (unknown gate, unknown stage, empty arrays, duplicates, advisory without
    reason, duplicate step names, skipped-and-covered, newline in a skip reason);
  - an old config loading unchanged.
- `cli/test/gates.test.mjs` (new, unit):
  - the catalog order;
  - applicability for each rule row (fixtures with and without dependencies, stacks and
    `release.publish`);
  - the order finding.
- `cli/test/verify-cli.test.mjs` (new, integration, black-box runs of `baton.mjs` in temporary
  repos, as `worktree-cli.test.mjs` does):
  - stage selection;
  - an advisory failure continuing with exit 0;
  - a blocking failure stopping with later steps `not-run`;
  - `--only` by step name and by gate, with the narrowed line and `narrowed: true`;
  - an old config's output;
  - the `--json` shape;
  - `start`'s baseline advisory line.
- `cli/test/tasks.test.mjs`:
  - `prBody` for each line combination;
  - empty lines left out;
  - `overrideFindings` on a body with every line.
- `cli/test/features.test.mjs`: `doctor`'s three findings and the context lines.
- `cli/test/git-guard.test.mjs` and `worktree-guard.test.mjs`: install writes and calls
  `commit-gates.sh`. A commit in a linked worktree:
  - fails on a failing blocking commit step;
  - passes on an advisory one;
  - passes with no commit steps;
  - fails with the install hint when `baton` isn't on `PATH`;
  - fails with the upgrade hint when `baton` rejects `--stage`.
  Rerunning install over an old stub rewrites it, and `doctor` reports missing commit gates.
- `cli/test/no-verify-guard.test.mjs` (new, unit): a table of commands.
  - Refused: `git commit --no-verify`, `git commit -n -m x`, `git commit -anm x`,
    `git push --no-verify`, `cd x && git commit -n`.
  - Allowed: `git commit -m "-n"`, `git push -n`, `git log -n 5`, `echo --no-verify`.
- `cli/test/release-templates.test.mjs` or a new pack test: `npm pack --dry-run --json` lists
  every runtime file and no test. The packed CLI's `baton help` and `baton verify` run from an
  unpacked tarball in a temporary directory.
- baton's own CI run on the migration PR is the end-to-end proof of `--stage ci`.

## Decisions
- ADR `docs/adr/0003-validate-is-the-gate-list.md`: `validate` is the repo's gate list, one step
  per check, named against baton's catalog, and `baton verify` is the only entry point locally
  and in CI. Specs 2-4 add gates and profiles on top of this, so it gets an ADR.
- `CONTEXT.md` gains Gate, Gate catalog, Step, Stage, Advisory step, Skipped gate and Narrowed
  run.
- #137 uses "unit" for a deployable, but `CONTEXT.md` already defines **Unit** as one session's
  spec. Spec 3 or 4, whichever introduces deployable units, must pick another word. This spec
  doesn't use the term.

## FAQ
### Why per-gate steps when #137's core says "one entry point in the repo"?
The entry point moves from the repo's script to `baton verify`, which reads the list from
`validate`. Each step still calls the repo's own recipe, so the tool commands stay in the
repo's runner and a human can run any of them without baton.

### Why can't a step be advisory without a reason?
A warning nobody has to fix is not a gate (#137 §3.4). The reason is what review reads when
deciding whether it should block.

### Why does `doctor` report gaps instead of `verify` failing on them?
A gap is a config gap, not a code failure. Failing every task PR in an existing repo because
the repo has no audit step would punish work unrelated to it. Spec 3's brief and adoption flow
close gaps on purpose.

### Why is `--no-verify` refused even with no commit steps?
The worktree guard is a pre-commit hook too, and `--no-verify` skips it. The always-on rule
already forbids it; the hook makes the rule hold.

## Open questions
None.

## Implementation status
- [x] plan: [docs/plans/2026-11-16-gates-core.md](../plans/2026-11-16-gates-core.md)
- [x] #166 gate catalog, applicability and config validation
- [x] #167 commit-gates hook, install and upgrade
- [x] #168 Claude Code hook refusing `--no-verify`
- [x] #169 npm package `@jcioriente/baton` and CI template
- [x] #170 stage runs, advisory steps and PR body in `verify`, `start` and `done`
- [x] #171 `doctor` gate findings, context lines and `init` suggestions
- [x] #172 baton's own repo on the new shape, with Biome
