# Every worktree in `.worktrees/` — Implementation Plan

- Spec: [docs/specs/2026-11-17-worktrees-folder.md](../specs/2026-11-17-worktrees-folder.md)
- Date: 2026-11-17
- Status: approved 2026-11-17

## Overview
Four tasks. No two tasks that can run at the same time share a file (owner's rule). Every
shared file is a dependency instead, across this plan, the
[structure-guards plan](2026-11-17-structure-guards.md) (T1a-T4) and #185. This plan holds the
one combined dependency graph.

- **W1, location.** `worktreeBase`, `isInWorktrees`, `ensureExcluded`, `createWorktree`,
  dropping `git.worktreeRoot` from the defaults, and `init` writing `/.worktrees/` to
  `.gitignore`.
- **W3, guards.** The git guard (`v2`) and the Claude Code edit guard. Their files are separate
  from W1's, so W1 and W3 run side by side after #185.
- **W2, reports.** `clean`'s scope, `status`'s mark, `doctor`'s three findings and the session
  rule. It runs after W1 (it shares `cli/baton.mjs` and `cli/test/worktree-cli.test.mjs`) and
  after W3 (it shares `cli/test/git-guard.test.mjs`, whose doctor test asserts the exact
  `worktree` findings).
- **W4, docs.** `docs/architecture.md`, the implement and integrate skills, `stacks/common.md`,
  `tests/skills/worktree.md` and baton's own `.gitignore`. It runs after structure-guards T2 and
  T3, which own `stacks/common.md` and `skills/implement/SKILL.md` first.

The spec and its `CONTEXT.md` terms are merged (#195).

### #185 and file ownership
#185 (config from the current worktree) has no plan block. The files it is expected to edit
are listed on the issue:
- `cli/lib/config.mjs` (`loadConfig`, `:95-97`), `cli/lib/git.mjs` and `cli/baton.mjs`;
- tests in `cli/test/verify-cli.test.mjs`, `cli/test/features.test.mjs`,
  `cli/test/git-guard.test.mjs` (commit gates, `:147-222`) and
  `cli/test/worktree-cli.test.mjs`;
- possibly `cli/lib/context.mjs`.

Only T1a, T2, T3 and W4 can run beside #185, and they don't share any of those files.

### Runtime coupling (not only file ownership)
- **W1 needs #185 at runtime.** `createWorktree` resolves the main checkout through
  `repoRoot()`, which #185 changes. W1 builds `worktreeBase` on the post-#185 split between the
  main root (worktree paths) and the current checkout (config).
- **W2's `clean` and `status` use W1's `isInWorktrees`.**
- **W3's guards don't call W1's code.** `hooks/worktree-guard.mjs` is standalone by design, and
  the `.sh` is shell. The guards act only after `baton hooks install` is rerun or the plugin
  updates, so the merge order of W1 and W3 doesn't matter on main. **Release constraint:**
  W1 and W3 ship in the same release, and reverting one reverts the other. Otherwise the new
  guards refuse the worktrees the old `worktree add` still creates.
- **The guards turn on for the owner's existing worktrees** in `../engineering-toolkit-worktrees/`
  once the guard is reinstalled and the plugin updates. Open PRs from those worktrees (#163,
  #182) should merge or move first.
- **W2's `git.worktreeRoot` finding fires on baton's own repo** (`.baton/config.json:11`) until
  structure-guards T4 deletes the key.
- **Structure-guards T1b** implements spec Goal 10 (`baton structure` skips `.worktrees/`) and
  depends on W2. **T4** comes after W1, W2 and W3, because its allowlist counts are exact and
  those tasks grow listed files.

## Contract
No API. The spec fixes these, and the tasks use them as written:
- the folder `<main checkout>/.worktrees/` and the path `<folder>/<branch with / replaced by ->`;
- the exclude line `/.worktrees/`, and the four accepted `.gitignore` forms;
- `clean`'s `outside` rows (`action` and `state` `outside`) and their text group;
- `status`'s `(outside .worktrees/)` mark and its `outside` JSON field;
- the three `doctor` messages;
- the git guard's and the edit guard's messages;
- `init`'s added output line;
- the session rule sentence.

## Impact
- **Affected call paths and consumers:**
  - `worktreeBase` feeds `start` and `worktree add`.
  - `clean` runs at the end of every task (`baton:integrate` step 4). Outside rows are never
    acted on, which keeps a wrong decision safe.
  - The git guard and the edit guard run on every commit and edit in every adopting clone.
    Both must keep failing open.
- **Data and migrations:** none. Old configs keep loading (`git.worktreeRoot` is ignored).
- **Tests that must stay green:** `baton verify`. In particular:
  - `worktree-cli.test.mjs` (worktree paths are asserted throughout);
  - `git-guard.test.mjs` (`:286` asserts the `v1` header, and `:492-519` asserts the exact
    `worktree` doctor findings);
  - `worktree-guard.test.mjs`.

  The handoff tests build worktrees with a raw `git worktree add` or literal paths and need
  no change.
- **Rollout and rollback:**
  - Ships in 0.8.0. W1 and W3 revert together (Runtime coupling).
  - **Release notes:** W3's PR body says that worktrees outside `.worktrees/` are refused
    for edits and commits once the guard is reinstalled, and gives the `git worktree move`
    command. `baton:release` carries it into the notes.

## Dependency graph
Both plans and #185:
```
#185 ──┬──> W1 ──┬──> W2 ──> T1b ──> T4
       └──> W3 ──┘           ^
T1a ─────────────────────────┘
T2 ──┬──> W4
T3 ──┘
```
Waves, each task alone in its own worktree:
1. #185, T1a, T2 and T3.
2. W1 and W3, after #185. W4, after T2 and T3.
3. W2, after W1 and W3.
4. T1b, after W2 and T1a.
5. T4, last.

## Tasks

### W1: Worktrees live in `.worktrees/`
- Priority: 1
- Depends on: #185
- Owns:
  - `cli/lib/git.mjs`;
  - `cli/lib/config.mjs` (drop `git.worktreeRoot` from the defaults);
  - `cli/test/config.test.mjs`;
  - `templates/config.example.json`;
  - `cli/baton.mjs` (`createWorktree`, `worktree add` and `init` only);
  - `cli/test/worktree-cli.test.mjs`.
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `worktreeBase(root: string): string`, returning `join(root, '.worktrees')`. The
    `config` parameter is removed.
  - Produces: `isInWorktrees(root: string, path: string): boolean`, comparing real paths on
    both sides.
  - Produces: `ensureExcluded(root: string): { added: boolean, warning?: string }`.
  - Produces: `GITIGNORE_FORMS: readonly string[]`, the four accepted lines, in
    `cli/lib/git.mjs`.
- Acceptance:
  - [ ] `baton worktree add x` and `baton start <n>` create under `<main>/.worktrees/`, even
    with `git.worktreeRoot` set in the config.
  - [ ] Two runs leave exactly one `/.worktrees/` line in `info/exclude`. An existing
    `.worktrees` line counts. A missing `info/` folder is created.
  - [ ] An unwritable `info/exclude` warns with the line to add and still creates the
    worktree.
  - [ ] A tracked `.worktrees` refuses with the spec's message.
  - [ ] `init`:
    - appends `/.worktrees/` to a missing `.gitignore`, to an existing one, and to one
      without a final newline;
    - leaves alone one that already has an accepted form;
    - prints the spec's line.
  - [ ] `DEFAULT_CONFIG`, `init`'s output config and `templates/config.example.json` have no
    `worktreeRoot`. A config that sets it still loads.
  - [ ] `git status` in the main checkout after `worktree add` shows nothing under
    `.worktrees/`.
- Tests first:
  - `worktree add creates under .worktrees even with worktreeRoot set`
  - `ensureExcluded adds the line once`
  - `ensureExcluded creates the info folder`
  - `worktree add refuses a tracked .worktrees`
  - `init adds /.worktrees/ to .gitignore without a final newline`
  - `isInWorktrees compares real paths`
  - `isInWorktrees accepts a nested path`
- Notes:
  - Use `realpathSync` on both sides (macOS `/tmp` is `/private/tmp`). For a path that
    doesn't exist yet, resolve its parent.
  - A test must fail when the code it covers is removed.

### W3: Git guard v2 and the edit guard refuse outside worktrees
- Priority: 1
- Depends on: #185 (shares `cli/test/git-guard.test.mjs`)
- Owns: `templates/git-hooks/worktree-guard.sh`, `hooks/worktree-guard.mjs`,
  `cli/test/git-guard.test.mjs`, `cli/test/worktree-guard.test.mjs`
- Touches (read-only or additive): none
- Interfaces:
  - Produces: `decide(...)` in `hooks/worktree-guard.mjs`, returning the outside deny text for
    a linked worktree outside the folder. Its signature is unchanged, plus a `mainTop` input if
    needed.
  - Produces: `outsideDenyText(path: string, top: string, main: string): string`.
- Acceptance:
  - [ ] The git guard, with `worktreeOnly` on in the main checkout's `HEAD`:
    - refuses a commit in an outside linked worktree, with the spec's message and the
      `git worktree move` command;
    - allows a commit inside `.worktrees/`.
  - [ ] The git guard reads the switch from the main checkout's `HEAD`, not the branch's:
    - it allows when the main checkout has `worktreeOnly: false`, even if the branch says
      `true`;
    - it refuses when the main checkout has `true`, even if the branch says `false`.
  - [ ] The git guard allows in CI, with `CLAUDE_CODE_REMOTE=true`, without a main checkout
    (bare repository or separate git dir), and on any internal error.
  - [ ] The main-checkout fallback command names `.worktrees/<name>`.
  - [ ] The script header says `v2`. `baton hooks install` rewrites a `v1` script, and
    `guardStatus` calls `v1` `outdated`.
  - [ ] The edit guard:
    - denies an edit in an outside linked worktree, with the spec's text;
    - allows edits inside `.worktrees/<name>/` (spec Goal 9);
    - allows gitignored files, CI, `CLAUDE_CODE_REMOTE=true` and `worktreeOnly: false`, and
      allows the edit when git fails.
  - [ ] The PR body has the release-note paragraph (Impact).
- Tests first:
  - `git guard refuses a commit in a worktree outside .worktrees`
  - `git guard reads worktreeOnly from the main checkout HEAD`
  - `git guard skips the outside check without a main checkout`
  - `edit guard allows edits inside .worktrees`
  - `edit guard denies edits in a worktree outside .worktrees`
- Notes:
  - The spec's Testing section names these two test files the other way round. In the code,
    `git-guard.test.mjs` covers the shell guard, the commit gates and install.
    `worktree-guard.test.mjs` covers `hooks/worktree-guard.mjs`.
  - Keep `hooks/worktree-guard.mjs` standalone, with no imports from `cli/`.
  - Both guards fail open. Test the failure paths, not only the deny.

### W2: `clean`, `status` and `doctor` report outside worktrees
- Priority: 1
- Depends on: W1 (shares `cli/baton.mjs` and `cli/test/worktree-cli.test.mjs`) and W3 (shares
  `cli/test/git-guard.test.mjs`)
- Owns:
  - `cli/baton.mjs` (`cleanWorktrees`, `cleanDecision`, `worktreeRows`/`status` and
    `doctor` only);
  - `cli/lib/context.mjs`;
  - `cli/test/features.test.mjs`;
  - `cli/test/worktree-cli.test.mjs`;
  - `cli/test/git-guard.test.mjs` (the doctor test's fixture `.gitignore` and expected
    findings only).
- Touches (read-only or additive): none
- Interfaces:
  - Consumes: `isInWorktrees(root, path)`, `GITIGNORE_FORMS` from `cli/lib/git.mjs` (W1)
  - Produces: `clean --json` rows with `action: 'outside'` and `state: 'outside'`, and
    `status --json` rows with `outside: boolean`.
- Acceptance:
  - [ ] `clean`, with one merged worktree inside and one outside:
    - removes only the inside one;
    - lists the outside one in the `Outside .worktrees/` group;
    - makes no PR lookup for it (a fake provider records the calls).
  - [ ] `--force` and `--dry-run` don't change outside rows. A stale outside record is
    reported, not pruned. A hand-made worktree inside `.worktrees/` is cleaned like baton's own.
  - [ ] `status` marks outside rows in text and JSON.
  - [ ] `doctor`:
    - always reports a leftover `git.worktreeRoot`;
    - reports each outside worktree, and a `.gitignore` at `HEAD` without an accepted form,
      only under the existing `worktree` condition;
    - reports neither of those two with `worktreeOnly: false`.
  - [ ] The session rule sentence is in `baton context`'s output.
- Tests first:
  - `clean never touches a worktree outside .worktrees`
  - `clean treats a hand-made worktree inside .worktrees like its own`
  - `doctor reports a .gitignore without .worktrees`
  - `doctor reports a leftover worktreeRoot`
  - `context states that every worktree lives in .worktrees`

### W4: Docs, skills and baton's own `.gitignore`
- Priority: 2
- Depends on: T2 and T3 (structure-guards plan; they own `stacks/common.md` and
  `skills/implement/SKILL.md` first)
- Owns: `docs/architecture.md`, `skills/implement/SKILL.md`, `skills/integrate/SKILL.md`,
  `stacks/common.md`, `tests/skills/worktree.md`, `.gitignore`
- Touches (read-only or additive): none
- Interfaces: none (docs and skill text)
- Acceptance:
  - [ ] `docs/architecture.md:9` uses `.worktrees/task-<n>-<slug>`, and its guard section
    mentions outside worktrees.
  - [ ] The implement and integrate skills say the printed path is under `.worktrees/`, and
    that `worktree clean` reports worktrees outside it.
  - [ ] `stacks/common.md` gains "Worktrees folder": tools that don't read git's ignore files
    exclude `.worktrees/` (tsconfig `exclude`, vitest or jest `exclude`, ESLint `ignores`).
  - [ ] `tests/skills/worktree.md:51` quotes the guard's new fallback line
    (`.worktrees/<name>`).
  - [ ] baton's `.gitignore` has `/.worktrees/`.
  - [ ] Skill descriptions are unchanged, and `make plugin-validate` passes.
- Tests first: none (docs). Load `writing-skills` before editing skills.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: create under `.worktrees/` whatever the config says | W1 |
| Goal 2: `info/exclude` line | W1 |
| Goal 3: `worktreeRoot` removed, still loads, doctor reports it | W1, W2; baton's own key: T4 |
| Goal 4: `clean` only inside, outside rows | W2 |
| Goal 5: `status` mark, doctor outside findings | W2 |
| Goal 6: doctor `.gitignore` finding | W2 |
| Goal 7: git guard refuses outside, fails open | W3 |
| Goal 8: session rule | W2 |
| Goal 9: edits inside `.worktrees/` allowed | W3 |
| Goal 10: `baton structure` skips `.worktrees/` | structure-guards T1b |
| Goal 11: `init` writes `.gitignore` | W1 |
| Goal 12: edit guard refuses outside | W3 |
| Goal 13: docs, skills, `common.md` | W4 |
| Release note: outside worktrees refused | W3 (PR body) |
| Failure mode: a symlinked repo path (`/tmp` vs `/private/tmp`) | W1: `isInWorktrees compares real paths` |
| Failure mode: a nested worktree path `.worktrees/a/b` | W1: `isInWorktrees accepts a nested path` |
| Failure mode: `info/exclude` missing its `info/` folder | W1: `ensureExcluded creates the info folder` |
| Failure mode: a worktree made by hand inside `.worktrees/` | W2: `clean treats a hand-made worktree inside .worktrees like its own` |
| Failure mode: a separate git dir (common dir not ending in `/.git`) | W3: `git guard skips the outside check without a main checkout` |
