# Layout and size guards (the `structure` gate) — Implementation Plan

- Spec: [docs/specs/2026-11-17-structure-guards.md](../specs/2026-11-17-structure-guards.md)
- Date: 2026-11-17
- Status: draft

## Overview
Four tasks. The CLI work is one slice, the guides and the skills are two independent doc tasks,
and baton's own repo goes last.

**Zero file sharing (owner's rule).** No file belongs to two tasks that can run at the same
time, not even as an additive touch. Every task works alone in its own worktree. Every file
two tasks need, across this plan, the
[worktrees-folder plan](2026-11-17-worktrees-folder.md) and #185, is turned into a dependency.
The combined order is in that plan's dependency graph.

- **T1, the command.** Owns `structure` config validation, `cli/lib/structure.mjs` and the
  `baton structure` dispatch. It is blocked by #185: the command reads the config of the
  checkout it runs in.
- **T2, the guides.** `stacks/common.md` "Size and structure" and the Layout sections in
  `rust.md`, `typescript.md`, `react.md` and `node.md`.
- **T3, the skills and the reviewer.** `baton:plan`, `baton:verify`, `baton:implement` and
  `reviewers/code-quality.md` item 7.
- **T4, applicability and dogfood.** Makes `structure` apply always and, in the same PR, gives
  baton's own repo the step and its allowlist. Doing both in one PR means baton's own
  `doctor` never shows the gap the spec warns about (spec, "baton's own repo").

The spec and its `CONTEXT.md` terms are already merged (#194).

### Runtime coupling (not only file ownership)
- **T1 needs #185 at runtime, not only to merge.** Before #185, `baton structure` in a linked
  worktree reads the main checkout's config, so T1's tests of a branch-local allowlist would
  pass in a temp repo yet the command would misbehave in real worktrees. T1 depends on #185.
- **T4's allowlist counts are exact.** Any later merge that changes a listed file makes the
  allowlist wrong on main.
  - So T4 runs after every other task that edits `cli/baton.mjs`, `cli/test/worktree-cli.test.mjs`,
    `cli/test/features.test.mjs`, `cli/test/release-templates.test.mjs` or
    `cli/test/git-guard.test.mjs`. That covers T1 here, and all of the worktrees-folder plan's
    CLI tasks, which edit `cli/baton.mjs` and those tests.
  - T4 takes its numbers from a fresh `node cli/baton.mjs structure --json` after rebasing on
    main, just before merge.
  - Any PR still open when T4 merges and that grew a listed file then fails CI. It has to
    split the file or rebase and shrink.
- **T4's step runs T1's command** (`node cli/baton.mjs structure`), so T4 depends on T1. It
  also depends on #185: before #185, `baton verify` in T4's worktree reads main's config and
  never runs the new step locally.
- **T1's messages point at `stacks/common.md, Size and structure`**, which T2 writes. The text
  is fixed by the spec, so T1 doesn't wait. Until T2 merges, the pointer names a section that
  doesn't exist yet. Harmless, but T2 should merge before the release.
- **T3's plan skill tells planners to run `baton structure --json`** (T1). The skill text can
  merge first: the command is in the same release.
- **Worktrees-folder spec, Goal 10:** `baton structure` never counts files under
  `.worktrees/`. T1 implements it, because T1 owns the counting code.
- **Shared files with the worktrees-folder plan and #185** become dependencies:
  - `cli/baton.mjs`, `cli/lib/config.mjs` and `cli/test/config.test.mjs` are also edited by #185,
    W1 and W2. So T1 depends on W2, which depends on W1, which depends on #185.
  - `cli/test/features.test.mjs` (W2), `cli/test/worktree-cli.test.mjs` (W1) and
    `cli/test/git-guard.test.mjs` (W3) are edited before T4, and T4 depends on all three.
  - `stacks/common.md` (T2) and `skills/implement/SKILL.md` (T3) are also edited by W4, so W4
    depends on T2 and T3.

## Contract
No API. The spec fixes these, and the tasks use them as written:
- config: `structure.maxLines` (default 500), `structure.exclude`, `structure.allowlist`, and
  config error texts `structure.<key>: <problem>`;
- the source extension list;
- `baton structure [--json] [--suggest-allowlist]`: the finding lines (allowlist state table and
  the `unlisted` line), the summary line and its not-counted suffix, the paste block, the
  `--json` shape `{ ok, maxLines, checked, notCounted, files: [{ path, lines, allowlisted, state }] }`
  and the help line;
- the section name `stacks/common.md`, "Size and structure";
- baton's step `{ "name": "structure", "gates": ["structure"], "run": "node cli/baton.mjs structure" }`.

## Impact
- **Affected call paths and consumers:**
  - `validateConfig` runs on every command, so a too-strict `structure` rule breaks every repo.
    A config without `structure` must load unchanged.
  - `applicableGates` feeds `doctor` and the session context. Flipping `structure` to `always`
    adds a doctor finding to every adopting repo (release notes).
  - `.baton/config.json` in baton's repo is read by CI (`verify --stage ci`), so a wrong
    allowlist turns main red.
- **Data and migrations:** none.
- **Tests that must stay green:** `baton verify` (all of `cli/test`, plugin validation,
  gitleaks, Biome, audit, pack). In particular `features.test.mjs`, whose doctor tests use
  configs that will now also need a `structure` step or skip.
- **Rollout and rollback:**
  - Ships in 0.8.0, with the other #137 specs. Each task reverts on its own.
  - Reverting T4 alone restores baton's config.
  - Reverting T1 after T4 breaks baton's own `structure` step, so revert T4 first.

## Dependency graph
```
#185 ──> W1 ──> W2 ──> T1 ──> T4
          └───> W3 ──────────> T4
T2 (independent)
T3 (independent)
```
W1-W3 are in the worktrees-folder plan. Can start immediately in parallel: #185, T2, T3.

## Tasks

### T1: `baton structure`: config, counting and the command
- Priority: 1
- Depends on: #185, W2 (worktrees-folder plan; it and W1 edit `cli/baton.mjs`,
  `cli/lib/config.mjs` and `cli/test/config.test.mjs` first)
- Owns: `cli/lib/structure.mjs` (new), `cli/test/structure.test.mjs` (new),
  `cli/test/structure-cli.test.mjs` (new), `cli/lib/config.mjs`, `cli/test/config.test.mjs`,
  `cli/baton.mjs` (only one dispatch entry and one help line, because the file is over the
  limit)
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `SOURCE_EXTENSIONS: readonly string[]` in `cli/lib/structure.mjs`.
  - Produces: `countLines(text: string): number`.
  - Produces: `matchGlob(pattern: string, path: string): boolean`, supporting `*`, `?` and
    `**`, with no dependency.
  - Produces: `checkStructure({ files: { path: string, lines: number | null, why?: string }[], skippedForExtension: number, config: { maxLines: number, exclude: string[], allowlist: Record<string, number> } }): { ok: boolean, maxLines: number, checked: number, notCounted: number, files: { path: string, lines: number | null, allowlisted: number | null, state: 'unlisted' | 'not-counted' | 'under-limit' | 'grew' | 'shrank' | 'held' }[] }`.
    It is pure and follows the spec's allowlist state table in order.
  - Produces: `runStructure(top: string, config: object, opts: { json: boolean, suggestAllowlist: boolean }): { ok: boolean }`.
    It lists with `git ls-files -z --cached --others --exclude-standard`, drops `.worktrees/`,
    reads files and prints.
  - Produces: `DEFAULT_CONFIG.structure = { maxLines: 500, exclude: [], allowlist: {} }` and
    the `validateConfig` rules.
- Acceptance:
  - [ ] `validateConfig` rejects each of these as `structure.<key>: <problem>`:
    - `maxLines` that isn't an integer ≥ 1;
    - `exclude` that isn't an array of non-empty strings;
    - `allowlist` that isn't an object;
    - an allowlist key that is empty or starts with `./` or `/`;
    - an allowlist value that isn't an integer ≥ 1;
    - an unknown key under `structure`.
  - [ ] An allowlist value at or under `maxLines` loads with no problem.
  - [ ] A config without `structure` loads and `baton structure` uses 500, no exclude and an
    empty allowlist.
  - [ ] Each spec finding line is printed for its case, sorted by path, with exit 1. A clean
    repo exits 0 with `no failures` in the summary.
  - [ ] An untracked, non-ignored source file over the limit fails. Ignored, excluded,
    non-source, deleted and symlinked files, submodules and anything under `.worktrees/` are
    not counted.
  - [ ] The summary's not-counted suffix appears only when files were skipped for their
    extension.
  - [ ] `--suggest-allowlist` prints the paste block and still exits 1. Without it there is no
    block.
  - [ ] `--json` matches the Contract shape.
  - [ ] A run from a subdirectory checks the whole checkout.
  - [ ] No file changes after a run (compare `git status --porcelain` and the config's mtime).
  - [ ] `baton help` lists the spec's help line.
- Tests first:
  - `countLines counts a final line without a newline and ignores CR`
  - `matchGlob ** matches zero or more segments and * stops at a slash`
  - `checkStructure reports a listed file under the limit before comparing counts`
  - `checkStructure reports shrank with the exact set-to edit`
  - `structure CLI counts an untracked file over the limit`
  - `structure CLI never counts files under .worktrees`
  - `structure CLI prints the allowlist block only with --suggest-allowlist`
  - `structure CLI writes nothing`
  - `config rejects an unknown key under structure`
- Notes:
  - Follow `verify-cli.test.mjs` and `worktree-cli.test.mjs` for black-box runs in temp repos.
  - Each test must fail when the code it covers is removed (docs/common-issues.md, once #163
    lands). Check it by deleting the line under test once.
  - Read files with `readFileSync` and count `\n` bytes. Don't split huge strings into arrays.

### T2: Guides: "Size and structure" and the Layout sections
- Priority: 2
- Depends on: none
- Owns: `stacks/common.md`, `stacks/rust.md`, `stacks/typescript.md`, `stacks/react.md`,
  `stacks/node.md`
- Touches (read-only or additive): none
- Interfaces: none (guide text)
- Acceptance:
  - [ ] `common.md`: "Size heuristics" is renamed "Size and structure" and holds:
    - the rule;
    - split in the same PR, as a move-only first commit;
    - move or change, never both, with `git diff --color-moved`;
    - organize by feature;
    - the five-row trigger table;
    - function size stays a prompt.
  - [ ] `rust.md` "Layout":
    - the four crate kinds;
    - `foo.rs` plus `foo/`, with clippy `mod_module_files`;
    - tests in `foo/tests.rs` or `tests/`;
    - the cargo-deny `[bans]` `wrappers` example, in a step that covers `structure` and
      `audit`.
  - [ ] `typescript.md` "Layout":
    - folders by feature;
    - package.json `imports` aliases;
    - one excluded folder for generated code;
    - tests split by behavior;
    - the directional rule in Biome (`overrides` with `noRestrictedImports`) and in ESLint
      (`import/no-restricted-paths` or `eslint-plugin-boundaries`);
    - the fixture recipe: kept out of the normal lint run, its own step covering `structure`
      beside `baton structure`, and its folder in `structure.exclude`.
  - [ ] `react.md` "Layout":
    - `app/`, `features/<name>/`, `domain/`, `shared/`, plus `surfaces/` for desktop;
    - imports go downward only;
    - features never import each other;
    - one public entry per feature, with no other barrels.
  - [ ] `node.md` "Structure" extended:
    - `src/modules/<name>/{routes,service,repository,schema}`;
    - thin entry points;
    - isolated config;
    - modules meet only through their service, enforced by the TypeScript Layout rule.
  - [ ] Every rule names what enforces it: the `structure` gate, a lint rule, cargo-deny, or
    review.
  - [ ] `make plugin-validate` passes.
- Tests first: none (guide text). Review checks each acceptance item against the spec's
  "Stack guide Layout sections".
- Notes:
  - Keep each guide's existing voice and length. A Layout section is a short list, not a
    tutorial.
  - Directional lint configs are snippets, so name no versions. The tool choice is spec 3's.

### T3: Skills and reviewer: split, no-raise and structure review
- Priority: 2
- Depends on: none
- Owns: `skills/plan/SKILL.md`, `skills/verify/SKILL.md`, `skills/implement/SKILL.md`,
  `reviewers/code-quality.md`
- Touches (read-only or additive): none
- Interfaces: none (skill text)
- Acceptance:
  - [ ] `baton:plan` step 2:
    - check the line counts of the files a task will grow;
    - a task that would cross the limit includes the split as its first, move-only commit,
      and lists the new siblings in Owns;
    - `structure.allowlist` entries are exempt from ownership, and a conflict is resolved by
      rerunning `baton structure`.
  - [ ] `baton:verify` step 2:
    - never raise `maxLines`, add or raise an allowlist entry, or add an `exclude` to get
      green;
    - the mechanical-change exception, with the owner's approval in the PR;
    - otherwise stop and ask;
    - lowering or removing an entry is expected.
  - [ ] `baton:implement`:
    - one line to place new files by the stack's Layout section;
    - one line to split a file in a move-only first commit before growing it past the limit.
  - [ ] `reviewers/code-quality.md` item 7:
    - lists the spec's five checks;
    - drops the file-size check;
    - its "Do not flag" list still excludes what lint enforces.
  - [ ] Skill descriptions (trigger wording) unchanged. `make plugin-validate` passes.
- Tests first: none (skill text). Load `writing-skills` before editing. Review checks the
  wording against the spec's "Skills and reviewers".
- Notes:
  - Keep each addition to one or two lines in the step it belongs to, since agents skip long
    additions.
  - The worktrees-folder plan's W4 edits `skills/implement/SKILL.md` after this merges.

### T4: `structure` applies always, and baton dogfoods it
- Priority: 1
- Depends on: T1, W3 (worktrees-folder plan). W1 and W2 come before it through T1.
- Owns: `cli/lib/gates.mjs`, `cli/test/gates.test.mjs`, `.baton/config.json`,
  `cli/test/features.test.mjs` (doctor gap tests, and fixture configs that now need a
  `structure` step or skip)
- Touches (read-only or additive): none
- Interfaces:
  - Consumes: `runStructure` from `cli/lib/structure.mjs` (T1), through `node cli/baton.mjs structure`.
  - Produces: `applicableGates` returns `{ gate: 'structure', why: 'always' }` for every repo.
- Acceptance:
  - [ ] `applicableGates` includes `structure` with `always` in a fixture with no stacks and
    no manifests.
  - [ ] `doctor` reports `gate 'structure' applies (always) but no step covers it and
    gates.skip doesn't list it`, and doesn't once a step covers it or `gates.skip` lists it.
  - [ ] baton's `.baton/config.json`:
    - has the structure step right after `lint`;
    - `structure.allowlist` holds exactly the counted files over 500 lines, with their
      counts from a fresh run on the rebased branch;
    - it has no `maxLines` and no `exclude`.
  - [ ] In this worktree, `baton doctor` reports no gate gaps and `baton verify` passes.
    Paste both outputs in the PR.
  - [ ] The PR body says that open PRs that grow a listed file must split it.
- Tests first:
  - `applicableGates applies structure always`
  - `doctor reports the structure gap until a step covers it`
- Notes:
  - Rebase on main and regenerate the counts right before merge. If main moves after that,
    rebase and regenerate again.
  - The allowlist is added with the owner's approval, which this plan records (the spec,
    "baton's own repo").

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: findings and exit codes | T1 |
| Goal 2: counted files, tests included, untracked counted | T1 |
| Goal 3: config fields, unknown keys, defaults | T1 |
| Goal 4: never writes, every finding says the edit | T1 |
| Goal 5: `structure` applies always, doctor finding | T4 |
| Goal 6: baton's step and allowlist, no gaps, verify passes | T4 |
| Goal 7: guides | T2 |
| Goal 8: plan, verify, implement, code-quality | T3 |
| `--suggest-allowlist`, `--json`, help line | T1 |
| Worktrees-folder Goal 10: skip `.worktrees/` | T1 |
| Failure mode: a file of exactly `maxLines` lines | T1: `checkStructure passes a file at exactly the limit` |
| Failure mode: an `exclude` glob with `**` matching zero segments | T1: `matchGlob ** matches zero or more segments and * stops at a slash` |
| Failure mode: a repo with no source files | T1: `structure CLI passes with 0 files checked in a repo with no source files` |
| Failure mode: an allowlist entry for an excluded file | T1: `checkStructure reports an excluded allowlist path as not counted` |
| Failure mode: a path with spaces or non-ASCII characters | T1: `structure CLI matches allowlist paths with spaces and non-ASCII characters` |
