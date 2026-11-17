# Every worktree in `.worktrees/` — Implementation Plan

- Spec: [docs/specs/2026-11-17-worktrees-folder.md](../specs/2026-11-17-worktrees-folder.md)
- Date: 2026-11-17
- Status: draft

## Overview
Four tasks, cut so that no two tasks that can run at the same time share a file (owner's
rule). Every shared file is a dependency instead, across this plan, the
[structure-guards plan](2026-11-17-structure-guards.md) (T1-T4) and #185.

- **W1, location.** `worktreeBase`, `isInWorktrees`, `ensureExcluded`, `createWorktree`,
  dropping `git.worktreeRoot`, and `init` writing `/.worktrees/` to `.gitignore`.
- **W2, reports.** `clean`'s scope, `status`'s mark, `doctor`'s three findings and the session
  rule. It shares `cli/baton.mjs` with W1, so it runs after W1.
- **W3, guards.** The git guard (`v2`) and the Claude Code edit guard. Their files are separate
  from W1 and W2, so W3 runs beside them.
- **W4, docs.** `docs/architecture.md`, the implement and integrate skills, `stacks/common.md`,
  and baton's own `.gitignore`. It runs after T2 and T3 of the structure-guards plan, which own
  `stacks/common.md` and `skills/implement/SKILL.md` first.

The spec and its `CONTEXT.md` terms merge first, in PR #195.

### #185 and file ownership
#185 (config from the current worktree) has no plan block. Its fix lives in
`cli/lib/config.mjs`, `cli/lib/git.mjs` and `cli/baton.mjs`. Its tests cover `verify`, `doctor`
and the commit-gates hook, so they edit `cli/test/verify-cli.test.mjs`,
`cli/test/features.test.mjs` and `cli/test/git-guard.test.mjs`. W1 and W3 therefore depend on
#185. W1 and W3 don't share a file with each other.

### Runtime coupling (not only file ownership)
- **W1 needs #185 at runtime.** `createWorktree` resolves the main checkout through
  `repoRoot()`, which #185 changes. W1 builds `worktreeBase` on the post-#185 split between the
  main root (for worktree paths) and the current checkout (for config).
- **W2's `clean` and `status` use W1's `isInWorktrees`**, so W2 depends on W1 at runtime as well
  as through the shared file.
- **W3's guard messages name `.worktrees/`**, which W1 creates. The guards don't call W1's code:
  `hooks/worktree-guard.mjs` is standalone by design, and the `.sh` is shell. So W3 can merge
  before W1, but until W1 lands, `baton worktree add` still creates outside worktrees that the
  new guards refuse. **W1 must merge before W3**, or every new worktree is refused in between.
  So W3 depends on W1 at runtime, while sharing no file with it.
- **The guards turn on for the owner's existing worktrees** in `../engineering-toolkit-worktrees/`
  once `baton hooks install` is rerun and the plugin updates. Open PRs from those worktrees
  (#163, #182) should merge or move first. The release notes say so.
- **Structure-guards T1** implements spec Goal 10 (`baton structure` skips `.worktrees/`) and
  depends on W2. **T4** depends on W3, and on W1 and W2 through T1, because its allowlist counts
  are exact and every task here grows a listed file.

## Contract
No API. The spec fixes these, and the tasks use them as written:
- the folder `<main checkout>/.worktrees/` and the path `<folder>/<branch with / replaced by ->`;
- the exclude line `/.worktrees/`, and the four accepted `.gitignore` forms;
- `clean`'s `outside` rows (`action`/`state` `outside`) and their text group;
- `status`'s `(outside .worktrees/)` mark and the `outside` JSON field;
- the three `doctor` messages;
- the git guard's and the edit guard's messages;
- `init`'s added output line;
- the session rule sentence.

## Impact
- **Affected call paths and consumers:**
  - `worktreeBase` feeds `start`, `worktree add` and `handoff`'s worktree listing.
  - `clean` runs at the end of every task (`baton:integrate` step 4), so a wrong `outside`
    decision would leave worktrees behind or remove the wrong ones. Outside rows are never
    acted on, which keeps the failure safe.
  - The git guard and the edit guard run on every commit and edit in every adopting clone.
    Both must keep failing open.
- **Data and migrations:** none. Old configs keep loading (`git.worktreeRoot` is ignored).
- **Tests that must stay green:** `baton verify`. In particular:
  - `worktree-cli.test.mjs` (worktree paths are asserted throughout);
  - `handoff-cli.test.mjs` and `handoff.test.mjs`, which mention the old folder;
  - `git-guard.test.mjs` and `worktree-guard.test.mjs`.
- **Rollout and rollback:**
  - Ships in 0.8.0. Each task reverts on its own.
  - Reverting W1 brings back `worktreeRoot`, but the W3 guards would then refuse its sibling
    worktrees. So revert W3 with W1.

## Dependency graph
Both plans and #185 together:
```
#185 ──> W1 ──> W2 ──> T1 ──> T4
          └───> W3 ──────────> T4
T2 ──┬──> W4
T3 ──┘
```
Can start immediately in parallel: #185, T2, T3. After #185: W1. After W1: W2 and W3 in
parallel. After W2: T1. After T2 and T3: W4. Last: T4.

## Tasks

### W1: Worktrees live in `.worktrees/`
- Priority: 1
- Depends on: #185
- Owns:
  - `cli/lib/git.mjs`;
  - `cli/lib/config.mjs` (drop `git.worktreeRoot` from the defaults);
  - `cli/test/config.test.mjs`;
  - `templates/config.example.json`;
  - `cli/baton.mjs` (only `createWorktree`, `worktree add` and `init`);
  - `cli/test/worktree-cli.test.mjs`;
  - `cli/test/handoff-cli.test.mjs` and `cli/test/handoff.test.mjs` (old folder paths in
    fixtures only, if any assert it)
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `worktreeBase(root: string): string` (returns `join(root, '.worktrees')`; the
    `config` parameter is removed).
  - Produces: `isInWorktrees(root: string, path: string): boolean` (real paths on both sides).
  - Produces: `ensureExcluded(root: string): { added: boolean, warning?: string }`.
  - Produces: `GITIGNORE_FORMS: readonly string[]` (the four accepted lines) in
    `cli/lib/git.mjs`.
- Acceptance:
  - [ ] `baton worktree add x` and `baton start <n>` create under `<main>/.worktrees/`, even
    with `git.worktreeRoot` set in the config.
  - [ ] Two runs leave exactly one `/.worktrees/` line in `info/exclude`. An existing
    `.worktrees` line counts.
  - [ ] An unwritable `info/exclude` warns with the line to add and still creates the
    worktree.
  - [ ] A tracked `.worktrees` refuses with the spec's message.
  - [ ] `init` appends `/.worktrees/` to a missing `.gitignore`, to an existing one, and to
    one without a final newline. It leaves alone one that already has an accepted form. It
    prints the spec's line.
  - [ ] `DEFAULT_CONFIG`, `init`'s output config and `templates/config.example.json` have no
    `worktreeRoot`. A config that sets it still loads.
  - [ ] `git status` in the main checkout after `worktree add` shows nothing under
    `.worktrees/`.
- Tests first:
  - `worktree add creates under .worktrees even with worktreeRoot set`
  - `ensureExcluded adds the line once`
  - `worktree add refuses a tracked .worktrees`
  - `init adds /.worktrees/ to .gitignore without a final newline`
  - `isInWorktrees compares real paths`
- Notes:
  - Use `realpathSync` on both sides (macOS `/tmp` is `/private/tmp`). For a path that
    doesn't exist yet, resolve its parent.
  - Each test must fail when the code it covers is removed.

### W2: `clean`, `status` and `doctor` report outside worktrees
- Priority: 1
- Depends on: W1
- Owns:
  - `cli/baton.mjs` (only `cleanWorktrees`, `cleanDecision`, `worktreeRows`/`status` and
    `doctor`);
  - `cli/lib/context.mjs`;
  - `cli/test/features.test.mjs`;
  - `cli/test/worktree-cli.test.mjs`, after W1.
- Touches (read-only or additive): none
- Interfaces:
  - Consumes: `isInWorktrees(root, path)`, `GITIGNORE_FORMS` from `cli/lib/git.mjs` (W1)
  - Produces: `clean --json` rows with `action: 'outside'`, `state: 'outside'`;
    `status --json` rows with `outside: boolean`.
- Acceptance:
  - [ ] `clean` with one merged worktree inside and one outside removes only the inside one,
    lists the outside one in the `Outside .worktrees/` group, and makes no PR lookup for it
    (a fake provider records calls).
  - [ ] `--force` and `--dry-run` don't change outside rows. A stale outside record is
    reported, not pruned.
  - [ ] `status` marks outside rows in text and JSON.
  - [ ] `doctor`:
    - always reports a leftover `git.worktreeRoot`;
    - reports each outside worktree and a `.gitignore` at `HEAD` without an accepted form,
      under the existing `worktree` condition only;
    - reports neither in a repo that has `worktreeOnly: false`.
  - [ ] The session rule sentence is in `baton context`'s output.
- Tests first:
  - `clean never touches a worktree outside .worktrees`
  - `doctor reports a .gitignore without .worktrees`
  - `doctor reports a leftover worktreeRoot`
  - `context states that every worktree lives in .worktrees`
- Notes:
  - `features.test.mjs` is on the structure-guards T4 allowlist path. Keep the additions
    focused; T4 records the final count.

### W3: Git guard v2 and the edit guard refuse outside worktrees
- Priority: 1
- Depends on: W1 (at runtime: see coupling), and through it #185 (which shares
  `cli/test/git-guard.test.mjs`)
- Owns: `templates/git-hooks/worktree-guard.sh`, `hooks/worktree-guard.mjs`,
  `cli/test/git-guard.test.mjs`, `cli/test/worktree-guard.test.mjs`
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `decide(...)` in `hooks/worktree-guard.mjs` returning the outside deny text for
    a linked worktree outside the folder. The signature is unchanged, plus a `mainTop` input
    if needed.
  - Produces: `outsideDenyText(path: string, top: string, main: string): string`.
- Acceptance:
  - [ ] The git guard, with `worktreeOnly` on in the main checkout's `HEAD`:
    - refuses a commit in an outside linked worktree, with the spec's message and
      `git worktree move` command;
    - allows a commit inside `.worktrees/`;
    - allows with `worktreeOnly: false` committed on the main checkout, even when the
      worktree's branch says `true`, and vice versa (proves which `HEAD` is read);
    - allows in CI, in a bare repository, and on any internal error.
  - [ ] The main-checkout fallback command names `.worktrees/<name>`. The script header says
    `v2`, `baton hooks install` rewrites a `v1` script, and `guardStatus` calls `v1`
    `outdated`.
  - [ ] The edit guard:
    - denies an edit in an outside linked worktree with the spec's text;
    - allows edits inside `.worktrees/<name>/` (spec Goal 9);
    - allows gitignored files, CI, `worktreeOnly: false`, and edits when git fails.
- Tests first:
  - `git guard refuses a commit in a worktree outside .worktrees`
  - `git guard reads worktreeOnly from the main checkout HEAD`
  - `edit guard allows edits inside .worktrees`
  - `edit guard denies edits in a worktree outside .worktrees`
- Notes:
  - Keep `hooks/worktree-guard.mjs` standalone, with no imports from `cli/`.
  - Both guards fail open. Test the failure paths, not only the deny.

### W4: Docs, skills and baton's own `.gitignore`
- Priority: 2
- Depends on: T2 and T3 (structure-guards plan; they own `stacks/common.md` and
  `skills/implement/SKILL.md` first)
- Owns: `docs/architecture.md`, `skills/implement/SKILL.md`, `skills/integrate/SKILL.md`,
  `stacks/common.md`, `.gitignore`
- Touches (read-only or additive): none
- Interfaces: none (docs and skill text)
- Acceptance:
  - [ ] `docs/architecture.md:9` uses `.worktrees/task-<n>-<slug>`, and its guard section
    mentions outside worktrees.
  - [ ] The implement and integrate skills say the printed path is under `.worktrees/`, and
    that `worktree clean` reports worktrees outside it.
  - [ ] `stacks/common.md` gains "Worktrees folder": tools that don't read git's ignore files
    exclude `.worktrees/` (tsconfig `exclude`, vitest or jest `exclude`, ESLint `ignores`).
  - [ ] baton's `.gitignore` has `/.worktrees/`.
  - [ ] Skill descriptions are unchanged, and `make plugin-validate` passes.
- Tests first: none (docs). Load `writing-skills` before editing skills.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: create under `.worktrees/` whatever the config says | W1 |
| Goal 2: `info/exclude` line | W1 |
| Goal 3: `worktreeRoot` removed, still loads, doctor reports it | W1, W2 |
| Goal 4: `clean` only inside, outside rows | W2 |
| Goal 5: `status` mark, doctor outside findings | W2 |
| Goal 6: doctor `.gitignore` finding | W2 |
| Goal 7: git guard refuses outside, fails open | W3 |
| Goal 8: session rule | W2 |
| Goal 9: edits inside `.worktrees/` allowed | W3 |
| Goal 10: `baton structure` skips `.worktrees/` | structure-guards T1 |
| Goal 11: `init` writes `.gitignore` | W1 |
| Goal 12: edit guard refuses outside | W3 |
| Goal 13: docs, skills, `common.md` | W4 |
| Failure mode: a symlinked repo path (`/tmp` vs `/private/tmp`) | W1: `isInWorktrees compares real paths` |
| Failure mode: a nested worktree path `.worktrees/a/b` | W1: `isInWorktrees accepts a nested path` |
| Failure mode: `info/exclude` missing its `info/` folder | W1: `ensureExcluded creates the info folder` |
| Failure mode: a worktree made by hand inside `.worktrees/` | W2: `clean treats a hand-made worktree inside .worktrees like its own` |
| Failure mode: a separate git dir (common dir not ending in `/.git`) | W3: `git guard skips the outside check without a main checkout` |
