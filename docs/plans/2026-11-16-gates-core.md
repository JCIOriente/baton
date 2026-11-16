# Engineering standard core (gate catalog, config shape, CLI) — Implementation Plan

- Spec: [docs/specs/2026-11-16-gates-core.md](../specs/2026-11-16-gates-core.md)
- Date: 2026-11-16
- Status: in backlog (#166, #167, #168, #169, #170, #171, #172)

## Overview
Seven tasks, cut by file ownership. `cli/baton.mjs` is shared by `verify`, `start`, `done`,
`doctor` and `hooks`, so the tasks that change it run in sequence (T2, then T3). Everything else
runs beside them.

- **T1, catalog and config.** Owns the catalog, applicability and config validation, all pure
  and unit-tested. T2 and T3 build on it.
- **T2, run engine.** Owns stage selection, advisory steps, narrowed runs and the summary, used
  by `verify`, `start` and `done`, plus the PR body lines.
- **T3, report.** Owns `doctor`'s gate findings, the session context lines and `init`'s
  suggested gates. It also wires T4's commit-gates status into `doctor`.
- **T4, commit hook.** Owns the commit-gates script and its install and upgrade. It exports a
  status function, so it doesn't need `cli/baton.mjs`.
- **T5, `--no-verify` refusal.** Owns the Claude Code hook. It's independent.
- **T6, npm package.** Owns the package, the npm release jobs and the CI template. It's
  independent.
- **T7, baton's own repo.** Moves to the new shape with Biome, once everything else has merged.

The spec, ADR-0003 and the `CONTEXT.md` terms are already merged (#164).

## Contract
No API. The spec fixes the following, and the tasks use them as written:
- Config fields: `gates`, `stages`, `blocking`, `reason` on a step, and `gates.skip`.
- The 17 catalog names and their order.
- The CLI surface:
  - `baton verify [--stage commit|local|ci] [--only <name>] [--json]`;
  - the `--json` shape `{ ok, stage, narrowed, results, notInStage, skipped }`;
  - the summary text;
  - the `Narrowed run` line;
  - the four PR body lines;
  - the baseline's advisory line.
- Hook messages: the install command `npm install -g @jcioriente/baton` and the upgrade command
  `npm install -g @jcioriente/baton@latest`.
- npm name `@jcioriente/baton`.

## Impact
- **Affected call paths and consumers:**
  - `runSteps` (`cli/baton.mjs:815`) is shared by `start` (setup and baseline), `verify` and
    `done`. T2 moves it to `cli/lib/verify.mjs`. `setup` keeps today's behavior: every step
    blocks and there are no stages.
  - `prBody` (`cli/lib/tasks.mjs:71`) feeds `overrideFindings` in `done`.
  - `validateConfig` runs on every command, so a too-strict rule breaks every repo.
  - The pre-commit stub is shared with the worktree guard.
  - `hooks/hooks.json` reaches every baton repo on the next release.
- **Data and migrations:** none. Old configs stay valid (spec goal 2). T1 and T2 each prove it
  with an old-config test.
- **Tests that must stay green:**
  - `make ci` (all of `cli/test`, plugin validation, gitleaks);
  - `worktree-cli.test.mjs` and `features.test.mjs`, which run `start`, `verify` and `done`
    end to end;
  - `git-guard.test.mjs` and `worktree-guard.test.mjs` for the stub.
- **Rollout and rollback:**
  - Everything ships in 0.8.0 and each task reverts on its own.
  - T7 reverts to the single `ci` step.
  - The first npm version is published by hand by the owner after the 0.8.0 release (spec,
    npm package), so T6's publish job is expected to fail once.

## Dependency graph
```
T1 ──> T2 ──> T3 ──> T7
T4 ─────────> T3
T5 (independent) ──> T7
T6 ──────────────────> T7
```
Can start immediately in parallel: T1, T4, T5, T6

## Tasks

### T1: Gate catalog, applicability and config validation  (#166)
- Priority: 1
- Depends on: none
- Owns: `cli/lib/gates.mjs` (new), `cli/lib/config.mjs`, `cli/test/config.test.mjs` (new),
  `cli/test/gates.test.mjs` (new)
- Touches (read-only or additive): `cli/lib/detect.mjs`, additive only. It exports a
  `hasDependencies(root: string): boolean` built on the existing private `manifests()`. T3
  edits `suggestValidate` in the same file later, after T1 merges.
- Interfaces:
  - Produces:
    - `GATES: readonly string[]` (catalog order);
    - `STATIC_GATES: ReadonlySet<string>`;
    - `STAGES: readonly ['commit', 'local', 'ci']`;
    - `DEFAULT_STAGES: readonly ['local', 'ci']`.
  - Produces: `normalizeStep(step: object): Step`, which fills defaults, where
    `Step = { name: string, run: string, cwd?: string, gates: string[], stages: string[], blocking: boolean, reason?: string }`.
    `gates` is `[]` when absent.
  - Produces: `applicableGates({ root, config }): { gate: string, why: string }[]`, following
    the spec's Applicability table, in catalog order.
  - Produces: `coverageFindings(config, applicable): { kind: 'gates', message: string }[]`. It
    covers uncovered gates and steps with no gate, using the spec's message texts.
  - Produces: `orderFindings(steps: Step[]): { kind: 'gates', message: string }[]`, which
    reports a static gate after a non-static one.
  - Produces: `hasDependencies(root: string): boolean` in `cli/lib/detect.mjs`.
  - Produces: `DEFAULT_CONFIG.gates = { skip: {} }`, and new `validateConfig` rules.
- Acceptance:
  - [ ] `validateConfig` rejects each of these and names the step's index and name:
    - an unknown gate;
    - an unknown stage;
    - an empty `gates` or `stages`;
    - a duplicate gate or stage within one step;
    - `blocking` that isn't a boolean;
    - `blocking: false` with no reason, or an empty one;
    - duplicate step names;
    - a `gates.skip` key that isn't in the catalog;
    - an empty skip reason, or one with a newline;
    - a gate that is both skipped and covered.
  - [ ] baton's current `.baton/config.json` and a minimal `{ validate: [{ run: 'x' }] }` load
    with no problems.
  - [ ] `applicableGates` matches every row of the Applicability table.
  - [ ] `setup` steps are not checked against the new rules.
- Tests first:
  - `config rejects an unknown gate name with the step index and name`
  - `config rejects an advisory step without a reason`
  - `config rejects a gate that is both skipped and covered`
  - `config rejects a skip reason with a newline`
  - `config accepts a config written before gates existed`
  - `applicableGates: package.json with only devDependencies adds install, audit, unused-deps`
  - `applicableGates: Cargo.toml one level down adds install, audit, unused-deps`
  - `applicableGates: release.publish non-empty adds publish`
  - `orderFindings: secrets after tests is reported`
  - `coverageFindings: a skipped gate is not a gap`
- Notes:
  - Keep `gates.mjs` free of I/O except through `hasDependencies` and `detectStacks`, which are
    passed in or called once.
  - Message texts are the spec's (Interfaces, `baton doctor`).

### T2: Stage runs, advisory steps and the PR body in `verify`, `start` and `done`  (#170)
- Priority: 1
- Depends on: T1
- Owns:
  - `cli/lib/verify.mjs` (new): `runSteps` moves here from `cli/baton.mjs`;
  - in `cli/baton.mjs`: `runSteps`, `runValidation`, `verify`, `start`'s baseline lines,
    `done`'s validation and body lines, and the `verify` help line;
  - `cli/lib/tasks.mjs`: `prBody`;
  - `cli/test/verify-cli.test.mjs` (new);
  - `cli/test/tasks.test.mjs`: the `prBody` cases.
- Touches (read-only or additive): `cli/lib/gates.mjs` (read).
- Interfaces:
  - Consumes: `normalizeStep(step: object): Step`, `STAGES` and `DEFAULT_STAGES` from
    `cli/lib/gates.mjs` (T1).
  - Produces: `runStage(steps: object[], top: string, { stage: string, only?: string, label: string, skip: Record<string, string> }): RunResult`,
    where
    `RunResult = { ok: boolean, stage: string, narrowed: boolean, results: StepResult[], notInStage: { name: string, stages: string[] }[], skipped: { gate: string, reason: string }[] }`
    and
    `StepResult = { name: string, run: string, gates: string[], blocking: boolean, status: 'passed' | 'failed' | 'not-run', code: number | null }`.
  - Produces: `formatSummary(res: RunResult): string`, the spec's summary text.
  - Produces: `runSetup(steps: object[], top: string): { ok: boolean, results: object[] }`,
    which keeps today's setup behavior.
  - Produces: `prBody(number: number, extra: string, res: RunResult | null): string`. This
    replaces the `results` array argument; `null` gives `(no validation configured)`.
- Acceptance:
  - [ ] `baton verify` runs only `local`-stage steps in config order, and `--stage ci` only
    `ci`-stage steps.
  - [ ] A failing advisory step is reported, later steps run, and the exit code is 0 when no
    blocking step failed.
  - [ ] A failing blocking step exits 1, and later steps show `not-run`.
  - [ ] `--only` accepts a step name or a gate name. Its output ends with
    `Narrowed run (--only <x>): not a gate run.`, and `--json` has `narrowed: true`. No match
    exits 1 and lists the stage's steps.
  - [ ] A stage with no steps prints `No validation steps in stage '<stage>'.` and exits 0.
  - [ ] `baton start`'s baseline prints `baseline: advisory '<name>' fails (<reason>)` for each
    failing advisory step.
  - [ ] The PR body from `baton done` has the four spec lines, leaving out empty ones.
    `overrideFindings` finds nothing in a body with all four.
  - [ ] Output for an old config (one `make ci` step) is today's per-step lines plus a summary
    showing `[no gate]`.
- Tests first:
  - `verify runs only local-stage steps by default`
  - `verify continues past a failing advisory step and exits 0`
  - `verify stops at a blocking failure and marks later steps not-run`
  - `verify --only by gate name prints the narrowed line`
  - `verify --only with no match in the stage exits 1`
  - `verify --stage commit with no commit steps exits 0`
  - `verify --json has the spec shape`
  - `start baseline reports a failing advisory step`
  - `prBody omits empty lines`
  - `prBody with all four lines has no override findings`
  - `verify --only selects the union of name and gate matches`
  - `verify reports the advisory failure and stops at the blocking one`
  - `verify fails the step whose cwd is missing`
  - `prBody with an override marker in a skip reason is flagged by overrideFindings`. `done`
    must check the final body, skip lines included, not only the body before validation
    (today it checks `prBody(n, extra, [])`, `cli/baton.mjs:896`).
- Notes:
  - Follow `worktree-cli.test.mjs` for black-box runs in temporary repos.
  - Keep stderr step lines (`▶`, `✔`, `✖`) unchanged; tests elsewhere may match them.

### T3: `doctor` gate findings, context lines and `init` suggestions  (#171)
- Priority: 2
- Depends on: T1, T2, T4
- Owns:
  - `cli/baton.mjs`: the `doctor` function only;
  - `cli/lib/context.mjs`: the validation lines;
  - `cli/lib/detect.mjs`: `suggestValidate`;
  - `cli/test/features.test.mjs`: the new doctor and context cases.
- Touches (read-only or additive): `cli/lib/gates.mjs`, `cli/lib/git-guard.mjs` (read).
- Interfaces:
  - Consumes:
    - `applicableGates({ root, config })`, `coverageFindings(config, applicable)`,
      `orderFindings(steps)` and `normalizeStep(step)` from `cli/lib/gates.mjs` (T1);
    - `commitGatesStatus(root: string, config: object): 'installed' | 'missing' | 'not-needed'`
      from `cli/lib/git-guard.mjs` (T4).
  - Produces: none beyond output.
- Acceptance:
  - [ ] `baton doctor` in a repo with a `package.json` that has devDependencies and only a
    `secrets` step lists `install`, `format`, `lint`, `unit-tests`, `audit` and `unused-deps`
    as uncovered, each with its reason, and exits 1.
  - [ ] It reports `step '<name>' covers no gate` for a step without `gates`.
  - [ ] It reports a static step that runs after a test step.
  - [ ] It reports commit gates as missing (kind `worktree`) when the config has a commit step
    and `commitGatesStatus` is `missing`.
  - [ ] Session context lines read like
    `` - lint [format, lint] (commit, local, ci): `make lint` ``. Default stages are not
    printed, and advisory steps end with `advisory: <reason>`.
  - [ ] `suggestValidate` tags each suggestion with the spec's gates.
- Tests first:
  - `doctor lists applicable gates no step covers`
  - `doctor reports a step with no gate`
  - `doctor reports static gates after tests`
  - `doctor reports missing commit gates`
  - `context prints gates, non-default stages and advisory reasons`
  - `init suggestions carry gates`

### T4: Commit-gates hook, install and upgrade  (#167)
- Priority: 1
- Depends on: none
- Owns:
  - `cli/lib/git-guard.mjs`;
  - `templates/git-hooks/commit-gates.sh` (new);
  - `templates/git-hooks/worktree-guard.sh`, only if the stub text changes;
  - `cli/test/git-guard.test.mjs`;
  - `cli/test/worktree-guard.test.mjs`.
- Touches (read-only or additive): none. `cli/baton.mjs` `hooks` already prints what
  `installGuard` returns. If its output needs a second manager line, T4 changes only how
  `installGuard`'s `managerLine` is built (a string with two lines), not `cli/baton.mjs`.
- Interfaces:
  - Produces: `installGuard(root)` also writes `<common dir>/baton/commit-gates.sh`. The stub
    calls it after the worktree guard. `managerLine` holds both lines, one per script.
  - Produces: `commitGatesStatus(root: string, config: object): 'installed' | 'missing' | 'not-needed'`.
    It returns `not-needed` when no `validate` step lists `commit` in `stages`. It reads
    `stages` directly, so it doesn't depend on T1.
  - Produces: `COMMIT_GATES_PATH: string`.
- Acceptance:
  - [ ] After `baton hooks install`, a commit in a linked worktree runs
    `baton verify --stage commit`:
    - it fails on a failing blocking commit step;
    - it passes on a failing advisory one;
    - it passes when there are no commit steps.
  - [ ] With no `baton` on `PATH`, the commit fails and prints
    `npm install -g @jcioriente/baton`.
  - [ ] With a `baton` that rejects `--stage`, the commit fails and prints
    `npm install -g @jcioriente/baton@latest`.
  - [ ] `CI=true` skips the script. In the main checkout, the script exits 0 and the guard
    decides.
  - [ ] Rerunning install over a stub written by 0.7.0 rewrites it. A stub with a user's line
    is still left alone.
  - [ ] Hook managers, `core.hooksPath` and husky get both lines and no edit.
- Tests first:
  - `commit in a linked worktree fails on a failing blocking commit step`
  - `commit passes when only an advisory commit step fails`
  - `commit fails with the install hint when baton is not on PATH`
  - `commit fails with the upgrade hint when baton rejects --stage`
  - `install rewrites a 0.7.0 stub`
  - `commitGatesStatus is missing when the stub lacks commit-gates`
- Notes:
  - Fake `baton` binaries on `PATH` stand in for the CLI, so the tests don't depend on T2.
    The fakes are a script that fails, one that passes, and one that prints an unknown-option
    error for `--stage`.
  - Detect "too old" from the exit status and stderr of that unknown-option error. The real
    CLI's `opts` error text is in `cli/baton.mjs` (read it; don't change it).

### T5: Claude Code hook refusing `--no-verify`  (#168)
- Priority: 2
- Depends on: none
- Owns: `hooks/no-verify-guard.mjs` (new), `hooks/hooks.json`,
  `cli/test/no-verify-guard.test.mjs` (new)
- Touches (read-only or additive): `hooks/worktree-guard.mjs` (read, for the hook I/O pattern).
- Interfaces:
  - Produces: `refusal(command: string): string | null`, exported for tests. It returns the
    message for a refused command, otherwise null.
- Acceptance:
  - [ ] These are refused, each with a message that says to fix the failing gate:
    - `git commit --no-verify -m x`;
    - `git commit -n -m x`;
    - `git commit -anm x`;
    - `git push --no-verify`;
    - `cd x && git commit -n`;
    - `git -C x commit -n`.
  - [ ] These are allowed:
    - `git commit -m "-n"`;
    - `git push -n`;
    - `git log -n 5`;
    - `echo --no-verify`;
    - `git commit -m 'skip --no-verify'`.
  - [ ] The hook is active only when the project has `.baton/config.json`.
  - [ ] Malformed hook input lets the call through, like `worktree-guard.mjs`.
- Tests first:
  - `refuses git commit -n`
  - `refuses git push --no-verify`
  - `allows git push -n`
  - `allows -n inside a quoted message`
  - `allows when the project has no baton config`
  - `refuses git commit -n after a semicolon`
- Notes:
  - Split the command into segments on `;`, `&&`, `||`, `|` and newlines, after removing
    quoted strings.
  - Within a segment, find `git` followed by optional global options (`-C <path>`,
    `-c <k=v>`), then the subcommand.

### T6: Publish the CLI to npm as `@jcioriente/baton`, and the CI template  (#169)
- Priority: 2
- Depends on: none
- Owns:
  - `package.json`: name, `private`, `files`, `publishConfig`. T7 adds devDependencies after
    this merges.
  - `.baton/config.json`: only `release.publish`. T7 rewrites `validate` after this merges.
  - `.github/workflows/release.yml`: the npm jobs from `templates/release/release.yml`.
  - `templates/ci.yml` (new);
  - `skills/init/SKILL.md`: the CI step;
  - `cli/test/package.test.mjs` (new).
- Touches (read-only or additive): `templates/release/release.yml` (read).
- Interfaces:
  - Produces: `templates/ci.yml`, which runs
    `npm exec --yes --package=@jcioriente/baton@{{version}} -- baton verify --stage ci` and
    carries a commented tool-install slot. `baton:init` fills `{{version}}` from
    `.claude-plugin/plugin.json`.
- Acceptance:
  - [ ] `npm pack --dry-run --json` lists `cli/baton.mjs`, `cli/lib/*`, `templates/**`,
    `reviewers/**`, `stacks/**`, `hooks/**` and `provenance.json`, and nothing under
    `cli/test/`, `tests/`, `evals/`, `docs/` or `skills/`.
  - [ ] A tarball unpacked in a temporary directory runs `baton help`, and `baton verify` in a
    temporary baton repo.
  - [ ] `release.yml` carries the `build-npm`, `dry-run-npm` and publish npm steps as
    `baton:init` step 6 leaves them.
  - [ ] `release.publish: ["npm"]`, and `baton doctor`'s release findings are clean.
  - [ ] `baton:init`'s CI step offers `templates/ci.yml`, and `claude plugin validate .`
    passes.
- Tests first:
  - `package files include every path the CLI reads at runtime`
  - `package excludes tests, evals, docs and skills`
  - `unpacked package runs baton help`
- Notes:
  - Find the runtime files by grepping `PLUGIN_ROOT` and `import.meta.url` in `cli/` and
    `hooks/`. `context` prints `stacks/` paths and `review` reads `reviewers/`.
  - A trial release with `dry_run: true` (the release skill's dry run) is the owner's step
    after merge, not this task's.

### T7: baton's own repo on the new shape, with Biome  (#172)
- Priority: 3
- Depends on: T2, T3, T5, T6
- Owns:
  - `.baton/config.json`: `validate`, `setup` and `gates`;
  - `Makefile`;
  - `.github/workflows/ci.yml`;
  - `biome.json` (new);
  - `package.json`: devDependencies and scripts;
  - `package-lock.json` (new);
  - `.git-blame-ignore-revs` (new);
  - the format-only commit across the repo's JS and JSON.
- Touches (read-only or additive): none.
- Interfaces: none (config).
- Acceptance:
  - [ ] Biome is added through `baton:deps`, at the version it resolves.
  - [ ] `validate` holds `secrets`, `install`, `lint`, `audit`, `tests`, `plugin` and `pack` as
    in the spec's "Change in a nutshell". `lint` runs in `local` and `ci` only, and `setup` is
    `npm ci`.
  - [ ] `gates.skip.unused-deps` carries its reason.
  - [ ] `baton doctor` reports no `gates` findings.
  - [ ] `ci.yml` runs `node cli/baton.mjs verify --stage ci`, and the PR's CI run passes.
  - [ ] The format-only commit changes formatting only and is listed in
    `.git-blame-ignore-revs`. The PR's other commits don't reformat.
  - [ ] `make ci` still runs the same recipes, with a comment saying `validate` is the source
    of truth.
  - [ ] Biome reports zero warnings.
  - [ ] Any rule turned off in `biome.json` has its reason beside it.
- Tests first: none new. The proof is `baton verify` on the PR and baton's CI run on its own
  shape.
- Notes:
  - One PR, two commits: config and tooling, then format-only. Record the format commit's sha
    after the squash. With squash merges, the format and the config land as one commit, so list
    the squash commit in `.git-blame-ignore-revs` in a follow-up commit on main, or ask the owner
    to merge this PR with a merge commit. The task asks the owner which.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: step fields and config errors | T1 |
| Goal 2: old configs unchanged; doctor reports gateless steps | T1, T2, T3 |
| Goal 3: doctor coverage and order findings | T1, T3 |
| Goal 4: verify stages, advisory, summary, narrowed run | T2 |
| Goal 5: start baseline, done gate and PR body lines | T2 |
| Goal 6: commit-stage hook | T4, T3 (doctor) |
| Goal 7: `--no-verify` refusal | T5 |
| Goal 8: npm package runs `verify --stage ci` | T6 |
| Goal 9: baton's own repo | T7 |
| `baton init` gates on suggestions and the CI template | T3, T6 |
| Session context lines | T3 |
| Failure mode: the `--only` value is both a step name and another step's gate | T2: `verify --only selects the union of name and gate matches` |
| Failure mode: an advisory step fails before a blocking one fails | T2: `verify reports the advisory failure and stops at the blocking one` |
| Failure mode: a `git commit` inside a subshell or after `;` | T5: `refuses git commit -n after a semicolon` |
| Failure mode: `cwd` of a stage step doesn't exist | T2: `verify fails the step whose cwd is missing` |
| Failure mode: a skip reason containing a commit override marker | T2: `prBody with an override marker in a skip reason is flagged by overrideFindings` |
