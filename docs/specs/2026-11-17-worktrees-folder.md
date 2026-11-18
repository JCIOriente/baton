# Every worktree in `<repo>/.worktrees/` — Spec

- Status: approved 2026-11-17
- Date: 2026-11-17
- Owner: Arnold Gandarillas
- Related: [worktree-only spec](2026-11-06-worktree-only.md) (the main-checkout guard),
  [ADR-0002](../adr/0002-changes-happen-in-linked-worktrees.md), the owner's request on 2026-11-17,
  [structure-guards spec](2026-11-17-structure-guards.md) (its guard must skip the folder)

## TL;DR
- Every linked worktree lives in `<main checkout>/.worktrees/<name>`. The location is fixed:
  `git.worktreeRoot` goes away.
- `baton start` and `baton worktree add` create worktrees there. They also write `/.worktrees/`
  to `.git/info/exclude`, so git and git-aware tools ignore the folder at once.
- `baton worktree clean` only looks inside `.worktrees/`. A worktree anywhere else is reported,
  never touched.
- The rule is enforced like the main-checkout rule:
  - the session's always-on rules say it;
  - the Claude Code edit guard refuses edits, and the git guard refuses commits, in a linked
    worktree outside `.worktrees/`;
  - `status`, `clean` and `doctor` report such worktrees.
- `baton init` adds `/.worktrees/` to `.gitignore` for the adoption commit.
- `doctor` also reports a leftover `git.worktreeRoot`, and a committed `.gitignore` that doesn't
  ignore `.worktrees/`.

## Change in a nutshell
Today `baton worktree add orgs-spec` creates `../<repo>-worktrees/orgs-spec`, a sibling folder
whose location each repo can configure. After this spec:

```text
$ baton worktree add orgs-spec
Worktree ready in /home/me/code/app/.worktrees/orgs-spec
branch: orgs-spec
Next: work only inside that directory.

$ baton worktree clean
Removed:
  task/12-orgs  PR #40 merged; branch kept
Outside .worktrees/ (not cleaned; every worktree belongs in /home/me/code/app/.worktrees/):
  old-spec  /home/me/code/app-worktrees/old-spec
```

A commit in `/home/me/code/app-worktrees/old-spec` is refused by the git guard once it is
reinstalled (`baton hooks install`).

## Problem
Worktrees end up in different places: the configured sibling folder, folders made by hand with
`git worktree add`, or a tool's own folder. That makes them hard to find, clean and reason about,
and `baton worktree clean` has to judge every linked worktree on the machine's paths. The owner
wants one fixed place per repo, inside it, with cleanup working over that place only. baton's
two adopting repos already keep their worktrees in `.worktrees/`.

## Goals / Success criteria
1. `baton start <n>` and `baton worktree add <name>` create the worktree at
   `<main checkout>/.worktrees/<branch with / replaced by ->`, whatever the config says.
2. Both commands make sure `<git common dir>/info/exclude` holds the line `/.worktrees/`. They
   append it when it is missing, and create the `info` folder if needed. Then `git status` in the
   main checkout shows nothing under `.worktrees/`.
3. `git.worktreeRoot` is gone from the defaults, from `baton init`'s output and from
   `templates/config.example.json`. A config that still sets it loads, the value is ignored,
   and `baton doctor` reports
   `git.worktreeRoot is no longer used; worktrees always live in .worktrees/ (delete the key)`.
4. `baton worktree clean` considers only linked worktrees whose path is inside
   `<main checkout>/.worktrees/`. Every other linked worktree is listed under
   `Outside .worktrees/ (not cleaned; ...)`, in text and in `--json` (`action: "outside"`), and
   nothing is done to it. Inside the folder, clean's rules are unchanged.
5. `baton status` marks a linked worktree outside the folder with `(outside .worktrees/)`.
   `baton doctor` reports each one, with kind `worktree`.
6. `baton doctor` reports, with kind `worktree`, when the committed `.gitignore` at the main
   checkout's `HEAD` has no line that ignores `.worktrees/`. It names the line to add
   (`/.worktrees/`) in a PR. `info/exclude` covers git, but not tools that read only
   `.gitignore`.
7. The git guard (`templates/git-hooks/worktree-guard.sh`), with `hooks.worktreeOnly` on,
   refuses a commit in a linked worktree whose top-level folder is not inside
   `<main checkout>/.worktrees/`. The message names the folder and the `git worktree move`
   command. `CI`, `CLAUDE_CODE_REMOTE`, a bare repository (no main checkout) and any internal
   error still let the commit through, as today.
8. The always-on session rule (`cli/lib/context.mjs:22`) adds: every worktree lives in
   `.worktrees/` and is made with `baton start` or `baton worktree add`, never with a bare
   `git worktree add` elsewhere.
9. The Claude Code edit guard (`hooks/worktree-guard.mjs`) keeps allowing edits inside
   `.worktrees/<name>/`: they belong to a linked worktree, not to the main checkout. A test
   proves it.
10. `baton structure` (structure-guards spec) never counts a file under `.worktrees/`, even
    when `info/exclude` lacks the line.
11. `baton init` appends `/.worktrees/` to the repo's `.gitignore` (creating the file if
    needed) unless an accepted line is already there, so it lands in the adoption commit with
    `.baton/config.json`. It prints that it did.
12. The Claude Code edit guard (`hooks/worktree-guard.mjs`), with `hooks.worktreeOnly` on,
    denies an edit in a linked worktree whose top-level folder is outside `.worktrees/`, with
    instructions to use `baton start` or `baton worktree add`. Goal 9 still holds for
    `.worktrees/<name>/`.
13. `docs/architecture.md`, the `baton:implement` and `baton:integrate` skills and
    `stacks/common.md` describe the new location. `common.md` says tools that don't read git's
    ignore files must exclude `.worktrees/` (for example tsconfig `exclude`, vitest or jest
    `exclude`, ESLint `ignores`).

## Non-goals
- Moving existing worktrees. Picked by the owner: baton does nothing to them beyond the
  reports, and no move command is added. `git worktree move` is named in the guard's message
  only.
- A configurable location. Picked by the owner.
- Editing the committed `.gitignore` of an existing repo. The main checkout is never edited;
  `doctor` names the line and a normal PR adds it. Only `baton init` writes it, for the
  adoption commit (Goal 11).
- Claude Code's own worktree folder (`.claude/worktrees/`, from its built-in worktree tool).
  baton's guards refuse edits and commits there like anywhere else outside `.worktrees/`.

## Approaches
Settled with the owner on 2026-11-17 before this was written:
- **Its own spec, or folded into the structure-guards spec:** its own small spec, with its tasks
  ahead of the structure-guards tasks. Picked by the owner.
- **Location: `<repo>/.worktrees/<name>`, a shared `../.worktrees/<repo>/<name>`, or
  configurable:** `<repo>/.worktrees/<name>`, fixed. Picked by the owner.
- **Clean: at session start, before `start`/`add`, a migration, or only inside the folder:**
  only inside `.worktrees/`, reporting worktrees elsewhere. Picked by the owner.
- **The old `git.worktreeRoot`: removed and reported by `doctor`, a config error, or kept with
  a new default:** removed, ignored when present, reported by `doctor`. Picked by the owner.
- **Enforcement: guard + rule + reports, or rule + reports only:** the guard as well. Picked by
  the owner.
- **Ignoring the folder: `info/exclude` written by baton plus a `doctor` check on `.gitignore`,
  or the committed `.gitignore` only:** `info/exclude` plus the `doctor` check. Picked by the
  owner.
- **`baton init` writing `/.worktrees/` to `.gitignore` in the adoption commit, or `doctor`
  only:** `init` writes it. Picked by the owner (from the builder check).
- **The edit guard refusing edits in outside worktrees, or only the commit refused:** the edit
  guard refuses them too, so an agent is stopped before doing a task in the wrong place.
  Claude Code's built-in worktree folder becomes unusable for edits in baton repos. Picked by
  the owner (from the builder check).
- **Existing worktrees elsewhere: reported with a move command, a `baton worktree move`
  command, or nothing:** nothing beyond the reports. Fewer code paths, and baton's two adopting
  repos already use `.worktrees/`. Picked by the owner.

Everything else below that the owner didn't pick is marked **(author's call)**.

## Users & permissions
n/a: no roles. The guard is per clone and stands down in CI and cloud sessions, as today.

## Tenancy & localization
n/a. CLI output stays English.

## Domain model
- **Worktrees folder:** `<main checkout>/.worktrees/`. It holds every linked worktree of the
  repository. It is ignored through `info/exclude` and, once a PR adds it, `.gitignore`.
- **Outside worktree:** a linked worktree whose top-level folder isn't inside the worktrees
  folder. baton reports it and never cleans it. The guard refuses commits in it.
- "Inside" compares real paths (symlinks resolved), so `/tmp` vs `/private/tmp` on macOS can't
  make a worktree look outside (author's call).

## Interfaces

### `cli/lib/git.mjs`
- `worktreeBase(root)` returns `join(root, '.worktrees')`. The `config` parameter and the
  `{repo}` pattern go away (author's call).
- New `isInWorktrees(root, path)`: true when the real path of `path` is inside the real path of
  `worktreeBase(root)`.
- New `ensureExcluded(root)`: appends `/.worktrees/` to `<common dir>/info/exclude` unless a line
  equal to `/.worktrees/` or `.worktrees/` or `.worktrees` is already there. It is called by
  `createWorktree` (`cli/baton.mjs:490-502`) before `git worktree add`.

### Config
- `DEFAULT_CONFIG.git.worktreeRoot` is deleted (`cli/lib/config.mjs:50`), and so are the `init`
  line (`cli/baton.mjs:193`) and the example config line.
- `validateConfig` doesn't reject the key (Goal 3).

### `baton worktree clean [--dry-run] [--delete-branch] [--force] [--json]`
- Plans only for linked worktrees inside the folder. Every other linked worktree becomes a row
  with `action: "outside"`, `state: "outside"` and `reason: "outside .worktrees/"`. No PR lookup
  is made for it (author's call: no GitHub calls for rows that are never acted on).
- Text output adds a last group, `Outside .worktrees/ (not cleaned; every worktree belongs in
  <folder>):`, listing `<branch or path>  <path>`.
- `--force` doesn't change the outside rows.
- A stale record (folder missing) outside the folder is reported too, not pruned. `baton
  worktree prune` still clears every stale record (author's call: prune is git's own
  bookkeeping and touches no files).

### `baton status [--json]`
Text rows for outside worktrees end with `(outside .worktrees/)`. `--json` rows gain
`outside: true|false` (author's call).

### `baton doctor`
The `worktreeRoot` finding always applies. The outside-worktree and `.gitignore` findings sit
with the existing `worktree` findings, under the same condition (`cli/baton.mjs:984`):
`hooks.worktreeOnly` on, not a disposable clone (CI, cloud session), and run from the main
checkout (author's call). `status`'s mark and `clean`'s scope don't depend on the switch,
because the location is fixed (author's call).

New findings:
- kind `config`: `git.worktreeRoot is no longer used; worktrees always live in .worktrees/
  (delete the key)`;
- kind `worktree`: `worktree <branch> is outside .worktrees/ (<path>)`, one per outside
  worktree;
- kind `worktree`: `.gitignore doesn't ignore .worktrees/ (add the line /.worktrees/ in a PR)`.
  `.gitignore` is read from the main checkout's `HEAD` (`git show HEAD:.gitignore`). Only a
  root `.gitignore` line equal to `/.worktrees/`, `.worktrees/`, `/.worktrees` or `.worktrees`
  (trailing whitespace dropped; a leading space stays, as git keeps it in the pattern) counts
  (author's call: no glob evaluation).

As today, any finding exits 1.

### Git guard (`templates/git-hooks/worktree-guard.sh`)
- Bumped to `v2`. `baton hooks install` rewrites it, as it does on every run.
- After the current main-checkout check, in a linked worktree:
  - the main checkout is `dirname(common dir)` when the common dir ends in `/.git`; otherwise
    (a bare repository or a separate git dir) the check is skipped (author's call);
  - with `hooks.worktreeOnly` on, read from the main checkout's `HEAD`
    (`git -C <main checkout> show HEAD:.baton/config.json`, as ADR-0002 says, so a branch
    can't switch its own refusal off), a top-level folder whose real path is not inside
    `<main checkout>/.worktrees/` refuses the commit (author's call on the ref):

```text
baton: this worktree is outside .worktrees/ (/home/me/code/app-worktrees/old-spec).
Every worktree lives in /home/me/code/app/.worktrees/. Move it with:
  git worktree move /home/me/code/app-worktrees/old-spec /home/me/code/app/.worktrees/old-spec
```

- The main-checkout message's fallback command (`../$repo-worktrees/<name>`) becomes
  `.worktrees/<name>`.
- `baton doctor` already reports a script that differs from the template as `outdated`
  (`guardStatus`, `cli/lib/git-guard.mjs:125`), so a clone with the `v1` script gets the
  existing `baton hooks install` finding. No new code.

### Edit guard (`hooks/worktree-guard.mjs`)
- `decide` gains a branch for linked worktrees (`gitDir !== commonDir`). It applies when the
  common dir ends in `/.git` and `hooks.worktreeOnly` is on in the main checkout's committed
  config. If `top`'s real path is not inside `<dirname(commonDir)>/.worktrees/`, the edit is
  denied with:

```text
baton: <path> is in a worktree outside .worktrees/ (<top>).
Every worktree lives in <main checkout>/.worktrees/.
- Task work: `baton start <n>`, then edit inside the printed path.
- Anything else: `baton worktree add <name>`, then edit there.
```

- Gitignored files, CI, cloud sessions and any git failure still allow the edit, as today.

### `baton init`
After writing `.baton/config.json`, `init` appends `/.worktrees/` to `.gitignore` at the repo
root when no accepted line (the four forms under `doctor`) is there. It creates the file if
needed and adds a leading newline when the file doesn't end with one. Its output adds
`Added /.worktrees/ to .gitignore; commit it with .baton/config.json.`

### Session context and skills
- `cli/lib/context.mjs:22` rule, added sentence: `Every worktree lives in .worktrees/ at the
  repo root, made by baton start or baton worktree add; never git worktree add elsewhere.`
- `skills/implement/SKILL.md` and `skills/integrate/SKILL.md`: the printed path is under
  `.worktrees/`; `worktree clean` reports worktrees outside it.
- `docs/architecture.md:9`: the path becomes `.worktrees/task-<n>-<slug>`.
- `stacks/common.md`, new short section "Worktrees folder": `.worktrees/` holds baton's
  worktrees. Tools that walk the tree without reading git's ignore files exclude it, such as
  tsconfig `exclude`, vitest or jest `exclude`, and ESLint `ignores`.

### Structure guard
`baton structure` drops any path under `.worktrees/` before counting (Goal 10). Task T1 of
[the structure-guards plan](../plans/2026-11-17-structure-guards.md) carries it, since it owns
the counting code.

## Behavior & edge cases
- The repo itself is checked out somewhere with a symlink in its path: real paths on both sides
  (Domain model).
- `.worktrees` exists as a tracked file or folder in the repo: `worktree add` refuses with
  `.worktrees is tracked in this repo; baton keeps worktrees there` (author's call: never write
  a worktree over tracked content).
- `info/exclude` isn't writable: `worktree add` still creates the worktree and prints a warning
  naming the line to add by hand (author's call: a failed ignore must not block work).
- A worktree created inside `.worktrees/` by hand (`git worktree add .worktrees/x`) is inside,
  so it is cleaned and accepted like baton's own.
- Nested worktree paths (`.worktrees/a/b`) are inside.
- Running `baton` from inside `.worktrees/<name>` resolves the main checkout through the common
  dir, as today. Nothing depends on the cwd being outside the main checkout.
- A tool started in the main checkout that ignores `.gitignore` and `info/exclude` sees every
  worktree. That cost was accepted with the location. `common.md` says how to exclude it.

## Data & migrations
- No data. Existing worktrees elsewhere stay where they are (owner's pick). They are reported by
  `status`, `clean` and `doctor`. Once the guard is reinstalled, commits in them are refused,
  with the move command.
- In baton's own repo, the worktrees in `../engineering-toolkit-worktrees/` are affected the same
  way. The guard isn't installed in the owner's clone today.
- The release notes for the version that ships this say so (author's call).

## Testing strategy
`baton verify` covers it. No paid evals: the trigger wording doesn't change.
- `cli/test/worktree-cli.test.mjs`:
  - `worktree add` and `start` create under `.worktrees/` and add the exclude line once (twice
    run, one line);
  - a config with `git.worktreeRoot` set still creates under `.worktrees/`;
  - `.worktrees` tracked: refused;
  - `clean` with one inside merged worktree and one outside merged worktree: only the inside
    one is removed, and the outside row is listed with no PR lookup;
  - `status` marks the outside one.
- `cli/test/features.test.mjs` (`doctor`): the three findings, and none in a repo with no
  `worktreeRoot`, `.gitignore` ignoring the folder, and no outside worktree.
- `cli/test/worktree-guard.test.mjs` (git guard): a commit in an outside linked worktree is
  refused with the move command; inside `.worktrees/` it passes; off when `worktreeOnly` is
  false, in CI, and in a bare repository.
- `cli/test/` for `hooks/worktree-guard.mjs`: an edit to `.worktrees/x/file` (a linked
  worktree under the main checkout) is allowed.
- `cli/test/git-guard.test.mjs`: install rewrites a `v1` script to `v2`, and `guardStatus` calls
  the `v1` script `outdated`.
- The test that covers `baton context` (`cli/test/features.test.mjs`): the rule sentence.
- `init`: adds the line to a missing, an existing and a no-final-newline `.gitignore`; leaves
  one that already has `.worktrees/`; prints the line.
- Edit guard: an edit in a linked worktree outside `.worktrees/` is denied with the text; off
  when `worktreeOnly` is false, in CI, and for a gitignored file.
- Each test must fail when the code it covers is removed.

## Decisions
- No ADR. ADR-0002 (worktree-only) stays; this spec narrows where worktrees live, and only
  this spec depends on the folder name.
- `CONTEXT.md`: **Linked worktree** says it lives in `.worktrees/`; new term **Outside
  worktree**.

## FAQ
### Why inside the repo, when tools may see the worktrees?
One folder per repo is easy to find, clean and reason about, and it is where baton's adopting
repos already keep them. git-aware tools skip it through `info/exclude` and `.gitignore`. The
guides name the tools that need an explicit exclude.

### Why refuse commits outside instead of only reporting?
A MUST that nothing enforces drifts. The main-checkout rule works because the guard enforces
it. This uses the same switch and the same fail-open rules.

### Why doesn't `clean` touch outside worktrees?
They weren't made by baton's commands, or were made under the old rule. Their owner decides.
The report says where they are.

## Open questions
None.

## Implementation status
- [x] plan: [docs/plans/2026-11-17-worktrees-folder.md](../plans/2026-11-17-worktrees-folder.md)
- [x] #200 worktrees live in `.worktrees/`
- [x] #202 clean, status and doctor reports
- [x] #201 git guard v2 and edit guard
- [x] #203 docs, skills and `.gitignore`
