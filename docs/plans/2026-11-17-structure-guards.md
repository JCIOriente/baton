# Layout and size guards (the `structure` gate) — Implementation Plan

- Spec: [docs/specs/2026-11-17-structure-guards.md](../specs/2026-11-17-structure-guards.md)
- Date: 2026-11-17
- Status: in backlog (#197, #204, #198, #199, #205)

## Overview
Five tasks.
- **T1a, the pure core.** Counting, glob matching and classification. All new files, so it
  starts at once.
- **T1b, the command.** Config validation, the `baton structure` runner and its dispatch,
  built on T1a.
- **T2 and T3, docs.** The guides, and the skills with the reviewer, run independently.
- **T4, applicability and dogfood.** Last. In one PR it makes `structure` apply always and
  gives baton's own repo the step and its allowlist, so baton's `doctor` never shows the gap
  the spec warns about.

**Zero file sharing (owner's rule).** No file belongs to two tasks that can run at the same
time, not even as an additive touch. Every task works alone in its own worktree. Every file two
tasks need, across this plan, the [worktrees-folder plan](2026-11-17-worktrees-folder.md) (W1-W4)
and #185, is turned into a dependency. There is one combined graph for both plans, in the
worktrees-folder plan's "Dependency graph"; this plan repeats it unchanged.

The spec and its `CONTEXT.md` terms are already merged (#194).

### Runtime coupling (not only file ownership)
- **T1b needs #185 at runtime, not only to merge.** Before #185, `baton structure` in a linked
  worktree reads the main checkout's config, so a branch-local allowlist is invisible.
- **T4's allowlist counts are exact.** Any later merge that changes a listed file makes the
  allowlist wrong on main.
  - So T4 runs after every task that edits `cli/baton.mjs` or a listed test file: T1b, W1, W2
    and W3.
  - T4 takes its numbers from a fresh `node cli/baton.mjs structure --json` after rebasing on
    main, just before merge.
  - Any PR still open when T4 merges that grew a listed file then fails CI. It has to split the
    file, or rebase and shrink it.
- **T4's step runs T1b's command** (`node cli/baton.mjs structure`), so T4 depends on T1b.
- **T1b's messages point at `stacks/common.md`, Size and structure**, which T2 writes. The text
  is fixed by the spec, so T1b doesn't wait. Until T2 merges, the pointer names a section that
  doesn't exist yet. T2 merges before the release.
- **T3's plan skill tells planners to run `baton structure --json`** (T1b). The command ships in
  the same release.
- **Worktrees-folder spec, Goal 10:** `baton structure` never counts files under `.worktrees/`.
  T1b implements it, because it owns the file listing.
- **W2's doctor finding for `git.worktreeRoot`** fires in baton's own repo
  (`.baton/config.json:11`) until T4 deletes the key.

## Contract
No API. The spec fixes these, and the tasks use them as written:
- config: `structure.maxLines` (default 500), `structure.exclude`, `structure.allowlist`, and
  config error texts `structure.<key>: <problem>`;
- the source extension list;
- `baton structure [--json] [--suggest-allowlist]`:
  - the finding lines (the allowlist state table and the `unlisted` line);
  - the summary line and its not-counted suffix;
  - the paste block;
  - the `--json` shape
    `{ ok, maxLines, checked, notCounted, files: [{ path, lines, allowlisted, state }] }`;
  - text on stderr, JSON on stdout;
  - the help line;
- the section name `stacks/common.md`, "Size and structure";
- baton's step `{ "name": "structure", "gates": ["structure"], "run": "node cli/baton.mjs structure" }`.

## Impact
- **Affected call paths and consumers:**
  - `validateConfig` runs on every command, so a too-strict `structure` rule breaks every repo.
    A config without `structure` must load unchanged.
  - `applicableGates` feeds `doctor` and the session context. Flipping `structure` to `always`
    adds a doctor finding to every adopting repo.
  - `.baton/config.json` in baton's repo is read by CI (`verify --stage ci`), so a wrong
    allowlist turns main red.
- **Data and migrations:** none.
- **Tests that must stay green:** `baton verify`. In particular `features.test.mjs`, whose
  doctor tests use configs that now also need a `structure` step or skip.
  `verify-cli.test.mjs:219` accepts exit 0 or 1, so the new finding doesn't break it.
- **Rollout and rollback:**
  - Ships in 0.8.0, with the other #137 specs. Each task reverts on its own.
  - Revert T4 before T1b, because baton's own step runs T1b's command.
  - **Release notes:** T4's PR body says every adopting repo gets a `structure` doctor finding
    until it adds the step or skips the gate. `baton:release` carries it into the notes.

## Dependency graph
Combined with the worktrees-folder plan and #185:
```
#185 ──┬──> W1 ──┬──> W2 ──> T1b ──> T4
       └──> W3 ──┘           ^
T1a ─────────────────────────┘
T2 ──┬──> W4
T3 ──┘
```
Can start immediately in parallel: #185, T1a, T2, T3.

## Tasks

### T1a: Structure core: counting, globs and classification  (#197)
- Priority: 1
- Depends on: none
- Owns: `cli/lib/structure.mjs` (new), `cli/test/structure.test.mjs` (new)
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `SOURCE_EXTENSIONS: readonly string[]`.
  - Produces: `countLines(buf: Buffer | string): number`, which counts `\n` (`0x0A`) and adds
    one for a non-empty input without a final newline.
  - Produces: `matchGlob(pattern: string, path: string): boolean`, supporting `*`, `?` and
    `**`, with no dependency.
  - Produces: `checkStructure({ files: { path: string, lines: number | null, why?: string }[], skippedForExtension: number, config: { maxLines: number, exclude: string[], allowlist: Record<string, number> } }): { ok: boolean, maxLines: number, checked: number, notCounted: number, files: { path: string, lines: number | null, allowlisted: number | null, state: 'unlisted' | 'not-counted' | 'under-limit' | 'grew' | 'shrank' | 'held' }[] }`.
    It is pure and follows the spec's allowlist state table in order.
  - Produces: `formatFindings(result): { lines: string[], summary: string, pasteBlock: string[] }`,
    with the spec's exact texts.
- Acceptance:
  - [ ] Each row of the allowlist state table gives its state and finding text, checked in the
    spec's order.
  - [ ] An unlisted file over the limit gives `unlisted` with the spec's line. A file at exactly
    `maxLines` passes.
  - [ ] The summary matches the spec, with the not-counted suffix only when
    `skippedForExtension > 0`.
  - [ ] Findings are sorted by path.
- Tests first:
  - `countLines counts a final line without a newline and ignores CR`
  - `matchGlob ** matches zero or more segments and * stops at a slash`
  - `checkStructure reports a listed file under the limit before comparing counts`
  - `checkStructure reports shrank with the exact set-to edit`
  - `checkStructure passes a file at exactly the limit`
  - `checkStructure reports an excluded allowlist path as not counted`
- Notes:
  - A test must fail when the code it covers is removed. Check it by deleting the line under
    test once.

### T1b: `baton structure`: config and the command  (#204)
- Priority: 1
- Depends on: T1a; #185; W2 (worktrees-folder plan). #185, W1 and W2 edit `cli/baton.mjs`,
  `cli/lib/config.mjs` and `cli/test/config.test.mjs` first.
- Owns:
  - `cli/lib/config.mjs`;
  - `cli/test/config.test.mjs`;
  - `cli/test/structure-cli.test.mjs` (new);
  - `cli/baton.mjs`, for one dispatch entry and one help line only, because the file is over
    the limit;
  - `cli/lib/structure.mjs`, after T1a, to add the runner.
- Touches (read-only or additive): none
- Interfaces:
  - Consumes: `checkStructure`, `formatFindings`, `countLines`, `matchGlob`,
    `SOURCE_EXTENSIONS` from `cli/lib/structure.mjs` (T1a).
  - Produces: `runStructure(top: string, config: object, opts: { json: boolean, suggestAllowlist: boolean }): { ok: boolean }`.
    It lists with `git ls-files -z --cached --others --exclude-standard`, drops `.worktrees/`,
    reads files and prints.
  - Produces: `DEFAULT_CONFIG.structure = { maxLines: 500, exclude: [], allowlist: {} }`, and
    the `validateConfig` rules.
- Acceptance:
  - [ ] `validateConfig` rejects each of these as `structure.<key>: <problem>`:
    - `maxLines` that isn't an integer ≥ 1;
    - `exclude` that isn't an array of non-empty strings;
    - `allowlist` that isn't an object;
    - an allowlist key that is empty or starts with `./` or `/`;
    - an allowlist value that isn't an integer ≥ 1;
    - an unknown key under `structure`.
  - [ ] An allowlist value at or under `maxLines` loads. A config without `structure` loads,
    and the command uses the defaults.
  - [ ] An untracked, non-ignored source file over the limit fails.
  - [ ] Each of these is not counted:
    - ignored, excluded and non-source files;
    - deleted files, symlinks and submodules;
    - a plain untracked file under `.worktrees/` (no `.git`, and no `info/exclude` line).
  - [ ] Text goes to stderr and `--json` to stdout, matching the Contract shape. Exit 0 with no
    findings, 1 with any.
  - [ ] `--suggest-allowlist` prints the paste block and still exits 1. Without it there is no
    block.
  - [ ] A run from a subdirectory checks the whole checkout.
  - [ ] No file changes after a run (`git status --porcelain` and the config's mtime).
  - [ ] `baton help` lists the spec's help line.
- Tests first:
  - `structure CLI counts an untracked file over the limit`
  - `structure CLI never counts a plain untracked file under .worktrees`
  - `structure CLI prints the allowlist block only with --suggest-allowlist`
  - `structure CLI writes nothing`
  - `structure CLI passes with 0 files checked in a repo with no source files`
  - `structure CLI matches allowlist paths with spaces and non-ASCII characters`
  - `config rejects an unknown key under structure`
- Notes:
  - Follow `verify-cli.test.mjs` and `worktree-cli.test.mjs` for black-box runs in temp repos.
  - The `.worktrees` fixture must be a plain folder. `git ls-files --others` lists a real
    nested worktree as a single entry, so a test built with `git worktree add` would pass even
    with the skip removed.

### T2: Guides: "Size and structure" and the Layout sections  (#198)
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
- Tests first: none (guide text). Review checks each item against the spec's "Stack guide
  Layout sections".
- Notes:
  - Keep each guide's voice and length. A Layout section is a short list, not a tutorial.
  - Name no tool versions in snippets.
  - W4 adds a "Worktrees folder" section to `common.md` after this merges.

### T3: Skills and reviewer: split, no-raise and structure review  (#199)
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
    - "Do not flag" still excludes what lint enforces.
  - [ ] Skill descriptions are unchanged, and `make plugin-validate` passes.
- Tests first: none (skill text). Load `writing-skills` before editing. Review checks the
  wording against the spec's "Skills and reviewers".
- Notes:
  - Keep each addition to one or two lines in the step it belongs to.
  - W4 edits `skills/implement/SKILL.md` after this merges.

### T4: `structure` applies always, and baton dogfoods it  (#205)
- Priority: 1
- Depends on: T1b. W1, W2 and W3 come before it through T1b.
- Owns: `cli/lib/gates.mjs`, `cli/test/gates.test.mjs`, `.baton/config.json`,
  `cli/test/features.test.mjs` (doctor gap tests, and fixture configs that now need a
  `structure` step or skip), `docs/configuration.md` (a `structure` line under "Key fields")
- Touches (read-only or additive): none
- Interfaces:
  - Consumes: `runStructure` (T1b), through `node cli/baton.mjs structure`.
  - Produces: `applicableGates` returns `{ gate: 'structure', why: 'always' }` for every repo.
- Acceptance:
  - [ ] `applicableGates` includes `structure` with `always` in a fixture with no stacks and
    no manifests.
  - [ ] `doctor` reports `gate 'structure' applies (always) but no step covers it and
    gates.skip doesn't list it`, and doesn't once a step covers it or `gates.skip` lists it.
  - [ ] baton's `.baton/config.json`:
    - has the structure step right after `lint`;
    - `structure.allowlist` holds exactly the counted files over 500 lines, with counts from
      a fresh run on the rebased branch;
    - it has no `maxLines` and no `exclude`;
    - it drops `git.worktreeRoot` (the worktrees-folder spec retires it).
  - [ ] `docs/configuration.md` lists `structure` with its three fields.
  - [ ] In this worktree, `baton doctor` reports no `gates` or `config` findings, and
    `baton verify` passes. Paste both outputs in the PR.
  - [ ] The PR body has the release-note paragraph (Impact), and says that open PRs that grow
    a listed file must split it.
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
| Goal 1: findings and exit codes | T1a, T1b |
| Goal 2: counted files, tests included, untracked counted | T1b |
| Goal 3: config fields, unknown keys, defaults | T1b |
| Goal 4: never writes, every finding says the edit | T1a, T1b |
| Goal 5: `structure` applies always, doctor finding | T4 |
| Goal 6: baton's step and allowlist, no gaps, verify passes | T4 |
| Goal 7: guides | T2 |
| Goal 8: plan, verify, implement, code-quality | T3 |
| `--suggest-allowlist`, `--json`, stderr/stdout, help line | T1b |
| Release note: the new doctor finding | T4 (PR body) |
| `docs/configuration.md` documents `structure` | T4 |
| Worktrees-folder Goal 10: skip `.worktrees/` | T1b |
| Failure mode: a file of exactly `maxLines` lines | T1a: `checkStructure passes a file at exactly the limit` |
| Failure mode: an `exclude` glob with `**` matching zero segments | T1a: `matchGlob ** matches zero or more segments and * stops at a slash` |
| Failure mode: a repo with no source files | T1b: `structure CLI passes with 0 files checked in a repo with no source files` |
| Failure mode: an allowlist entry for an excluded file | T1a: `checkStructure reports an excluded allowlist path as not counted` |
| Failure mode: a path with spaces or non-ASCII characters | T1b: `structure CLI matches allowlist paths with spaces and non-ASCII characters` |
