# Worktree-only changes — Spec

- Status: approved
- Date: 2026-11-06
- Owner: Arnold Gandarillas
- Related: [ADR-0002](../adr/0002-changes-happen-in-linked-worktrees.md)

## TL;DR
- Every change in a baton repo happens in a **linked worktree**. The **main checkout** stays
  parked on the base branch and is never edited or committed in. This now covers specs, plans
  and docs too, not only task code.
- Two guards enforce it, both on by default (`hooks.worktreeOnly`, default `true`):
  a Claude Code `PreToolUse` hook denies `Edit`/`Write`/`MultiEdit`/`NotebookEdit` on files in
  the main checkout, and a git `pre-commit` guard refuses commits made there by anyone (Bash,
  a human, an editor).
- The deny message says where to go instead: `baton start <n>` for a task, and a new
  `baton worktree add <name>` for work that is not a task (spec, plan, docs, config).
- Both guards read the switch from the main checkout's committed `HEAD`, fail open on any
  internal error, and stand down in CI and in cloud sessions, where the checkout is disposable.
- `baton hooks install` installs the git guard without overwriting an existing hook or hook
  manager. `baton doctor` and the session context report a missing guard.

## Change in a nutshell
An agent in a session opened at `~/Projects/acme` tries to edit the spec it is drafting:

```text
Edit ~/Projects/acme/docs/specs/2026-11-10-orgs.md
-> denied:
baton: docs/specs/2026-11-10-orgs.md is in the main checkout (~/Projects/acme).
Every change happens in a linked worktree (hooks.worktreeOnly).
- Task work: `baton start <n>`, then edit inside the printed path.
- Anything else (spec, plan, docs, config): `baton worktree add <name>`, then edit the same
  relative path under the printed path.
Gitignored files are not affected. Turning this off is the user's decision
("hooks": { "worktreeOnly": false } in .baton/config.json, merged to the base branch).
```

The agent runs `baton worktree add orgs-spec`, which prints
`~/Projects/acme-worktrees/orgs-spec` (branch `orgs-spec` from `origin/main`), and writes the
spec there. A human who runs `git commit` in `~/Projects/acme` gets the same refusal from the
git guard. Edits and commits in any linked worktree, including Claude Code's own
`.claude/worktrees/*` and worktrees nested inside the main checkout's directory, are untouched.

## Problem
Several sessions and people share one main checkout. One of them switches its branch or leaves
uncommitted edits, and every other session's next edit lands on the wrong branch or mixes with
someone else's work. On 2026-10-29 this repo's main checkout sat on `spec-release-phase` with
another agent's uncommitted edits while a second session needed a new branch and could not
create one. baton already says to edit only inside a task's worktree (`cli/lib/context.mjs:9`,
`skills/implement/SKILL.md:17-18`), but only as text, only for tasks, and the skills that commit
specs, plans and lessons don't say where (`skills/spec/SKILL.md:55`, `skills/plan/SKILL.md:46`,
`skills/backlog/SKILL.md` step 4, `skills/retro/SKILL.md` step 4). Agents follow an always-on
rule more reliably than a skill step, and a hook more reliably than either.

## Goals / Success criteria
- With `hooks.worktreeOnly` on (the default), an agent's `Edit`, `Write`, `MultiEdit` or
  `NotebookEdit` on a tracked or new, non-ignored file in the main checkout is denied with the
  message above. The same call on the same relative path in a linked worktree succeeds.
- With the git guard installed, `git commit` (including `--amend`) in the main checkout exits
  non-zero with a message naming `baton worktree add`. A commit in a linked worktree succeeds.
- `baton worktree add <name>` creates a worktree on a new branch from `<remote>/<baseBranch>`
  without a task, and prints its path. Running it again prints the same path.
- `baton hooks install` never changes an existing `pre-commit` it did not write and never writes
  inside the working tree (for example a tracked `.githooks/` or `.husky/`). In those cases it
  prints the one line to add.
- Neither guard fires in CI (`CI=true`), in a cloud session (`CLAUDE_CODE_REMOTE=true`), outside
  a git repo, in a repo without a committed `.baton/config.json`, or with `worktreeOnly: false`
  committed at the main checkout's `HEAD`.
- Any internal error in either guard allows the action.
- The spec, plan, backlog, retro and init skills, and the session context, tell agents to
  work in a worktree. `baton init` writes its config into the checkout it runs in.

## Non-goals
- Catching writes made through Bash (`sed -i`, `npm install`, `git checkout -b` in the main
  checkout). The commit guard catches them when they would be committed; parsing shell commands
  is unreliable. A branch switch in the main checkout is still possible and still disruptive;
  the session rule covers it.
- Blocking `git commit --no-verify` or `git stash` in a Bash call. The session rule forbids
  agents from using `--no-verify`; a Bash-matcher hook for it can follow if agents ignore that.
- A `pre-merge-commit` guard. A merge commit in the main checkout comes from a non-fast-forward
  `git pull`, which needs a local commit first, which the `pre-commit` guard refuses.
- `baton done` for branches that are not tasks. Spec, plan and docs branches open their PR
  with `gh pr create`, as today.
- Moving existing uncommitted changes out of the main checkout. They may belong to another
  session. The guards never stash, reset or move anything.
- A per-machine override (environment variable or local config). The switch is a repo decision
  made by a merged PR; a person can still pass `--no-verify` or remove the installed hook.
- `baton hooks uninstall`. Removing the two files by hand is documented in the command's output.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Agent in a baton repo | Edit and commit in any linked worktree; create one with `baton start <n>` or `baton worktree add <name>`; edit gitignored files in the main checkout | Edit or commit tracked or new files in the main checkout; use `--no-verify`; turn the guard off |
| Human contributor | Same as an agent; bypass the git guard with `--no-verify` | Turn either guard off for the repo without a merged config change |
| Maintainer | Turn the guard off for the repo by merging `hooks.worktreeOnly: false` | — |

## Tenancy & localization
n/a. Messages are English, like the rest of the CLI.

## Domain model
- **Main checkout**: the working tree whose git dir is the repository's common dir
  (`git rev-parse --git-dir` equals `--git-common-dir`). One per non-bare clone. Stays on the
  base branch and only fast-forwards.
- **Linked worktree**: any other working tree of the same repository (`git worktree add`), whose
  git dir is `<common dir>/worktrees/<id>`. All changes happen in one.
- **Guard state** is not stored. Each call recomputes it from git and the committed config.
- Invariant: a file path belongs to exactly one checkout, the one git resolves from the file's
  nearest existing directory. A worktree nested inside the main checkout's directory (for
  example `.worktrees/x/` or `.claude/worktrees/x/`) resolves to itself, not to the main
  checkout.

## Interfaces

### Config
`hooks.worktreeOnly`: boolean, default `true` in `DEFAULT_CONFIG` (next to `factGate`,
`cli/lib/config.mjs:82-85`). `validateConfig` rejects a non-boolean. `baton init` writes it
explicitly, as it does `factGate`.

The guards read it from `git show HEAD:.baton/config.json` in the main checkout, not from the
working tree. A committed config without the key means on. A missing, unreadable or invalid
committed config means off (fail open).

### Claude Code hook: `hooks/worktree-guard.mjs`
Registered in `hooks/hooks.json` as a second `PreToolUse` hook, matcher
`Edit|Write|MultiEdit|NotebookEdit` (the fact gate keeps its own matcher). It reads the path from
`tool_input.file_path`, or `tool_input.notebook_path` for `NotebookEdit`, resolved against the
input's `cwd`. Steps, each failing open:

1. `CI=true` or `CLAUDE_CODE_REMOTE=true` -> allow.
2. From the nearest existing ancestor directory of the path, run
   `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel`. Failure
   (not a repo, or inside `.git`) -> allow.
3. `git-dir != git-common-dir` (linked worktree) -> allow.
4. `git check-ignore -q <path>` succeeds (ignored, untracked) -> allow. A tracked file that
   matches an ignore pattern is not ignored and stays guarded.
5. Committed config at `HEAD` of that top-level says off, or is absent -> allow.
6. Otherwise deny (`permissionDecision: "deny"`) with the message in "Change in a nutshell",
   paths filled in, relative path from the top-level.

The decision is a pure exported function over the git answers, the ignore result, the parsed
config and the environment, so tests cover it without git.

### Git guard
- `templates/git-hooks/worktree-guard.sh`: a self-contained POSIX `sh` script, first line marker
  `# baton worktree-guard v1`. It does steps 1, 3 and 5 above (no ignore check: a commit only
  holds staged files), using `node` only to parse the committed JSON. Node missing, a git
  error, or JSON it can't parse -> exit 0. When it refuses, it prints to stderr:

  ```text
  baton: commits in the main checkout are refused (hooks.worktreeOnly in .baton/config.json).
  Make the change in a linked worktree:
    baton worktree add <name>
    (without baton on PATH: git worktree add --no-track -b <name> ../<repo>-worktrees/<name> origin/<base>)
  ```

  and exits 1. It never references the plugin's install path, which changes with each version.
- `baton hooks install [--json]`:
  1. Writes the script to `<git common dir>/baton/worktree-guard.sh` (untracked, shared by all
     worktrees of the clone, overwritten on every run so upgrades refresh it). Orientate uses
     the same place for its hook dispatchers (`<git-common-dir>/orientate-hooks`).
  2. Resolves the hooks directory with `git rev-parse --git-path hooks`, which honors
     `core.hooksPath`.
  3. If that directory is inside the git common dir and has no `pre-commit`: writes a stub
     `pre-commit` (marker `# baton:worktree-guard`, executable) that runs the script.
     If `pre-commit` carries the marker: rewrites it.
  4. Otherwise (a foreign `pre-commit`, or a hooks directory in the working tree such as
     `.husky/` or `.githooks/`, or lefthook / pre-commit framework config): changes nothing and
     prints the line to add to that hook or manager:

     ```sh
     g="$(git rev-parse --git-common-dir)/baton/worktree-guard.sh"; [ ! -f "$g" ] || sh "$g" || exit 1
     ```

     The line is a no-op in clones without the script, including CI, so it can be committed.
  5. Prints what it did and how to undo it (delete the two files).
- Installed means: the script exists and matches the template, and the resolved `pre-commit`
  (or `lefthook.yml`, `.lefthook.yml`, `.pre-commit-config.yaml`) mentions
  `baton/worktree-guard.sh`.

### CLI changes
- `baton worktree add <name> [--setup] [--json]`: `slugify(name)` is both the branch and the
  directory name under `worktreeBase`. Fetches the base like `createWorktree`
  (`cli/baton.mjs:389-403`) and branches from `<remote>/<baseBranch>` with `--no-track`, so the
  first push never targets the base branch. An existing worktree on that branch -> prints its
  path. An existing local branch without a worktree -> checks it out. `--setup` runs the
  `setup` steps; without it none run, since docs work rarely needs dependencies.
- `baton worktree remove <n|name>`: also accepts a name added with `worktree add`
  (`cli/baton.mjs:414-423` accepts task numbers only today).
- `baton init` writes `.baton/config.json` and the docs dirs into the current checkout
  (`currentTop`) instead of the main checkout (`repoRoot`, `cli/baton.mjs:143-144`), so a
  reconfiguration with `--force` can happen in a worktree.
- `baton doctor`: with `worktreeOnly` on, reports a missing or outdated git guard
  ("run `baton hooks install`"), and reports when the main checkout is not on the base branch.
- `baton context`: with `worktreeOnly` on, the first always-rule becomes:
  "Never edit or commit in the main checkout. Task work happens in the worktree from
  `baton start <n>`; anything else (specs, plans, docs, config) in one from
  `baton worktree add <name>`. Never use `git commit --no-verify`." With it off, the current
  rule stays. When the git guard is not installed, one more line says so and names
  `baton hooks install`.

### Skill changes
- `baton:spec`: before writing the spec (step 6), `baton worktree add <topic>` and write, commit
  and iterate there. After approval, push and open the PR with `gh pr create`.
- `baton:plan`: write the plan in the spec's worktree while its branch is unmerged, otherwise
  in a new one. Same PR rule.
- `baton:backlog` step 4 and `baton:retro` step 4: commit in a worktree from
  `baton worktree add`, never in the main checkout.
- `baton:init`: the adoption commit (step 9) is the one commit made in the main checkout, which
  the guards allow because `HEAD` has no config yet. A new step after it runs
  `baton hooks install` and shows the result. Re-runs (for example step 8 alone) happen in a
  worktree.
- `baton:integrate` step 4: after the merge and worktree cleanup, fast-forward the main
  checkout (`git -C <main checkout> pull --ff-only`), so the config and docs it serves are
  current.

## Behavior & edge cases
- **New file in a new directory**: the nearest existing ancestor decides. A new file in the
  main checkout is denied unless an ignore rule covers it.
- **Gitignored files** (`.env`, local settings) in the main checkout: allowed. They never reach
  a commit, and setups like orientate's copy root `.env` files into each worktree.
- **Paths inside `.git`**, outside any repo, or in a repo without a committed baton config:
  allowed.
- **Submodules**: a submodule's checkout resolves to its own repository. Its committed config
  decides.
- **Bare repo with worktrees**: every working tree is linked, so nothing is refused.
- **Detached HEAD**: in a linked worktree, allowed; in the main checkout, refused like any other
  state.
- **Unborn branch** (fresh `git init`): `HEAD:.baton/config.json` doesn't resolve, so both guards
  allow. The adoption commit goes through.
- **Main checkout behind the base branch**: the switch takes effect when the main checkout
  fast-forwards, since the guards read its `HEAD`.
- **CI and release automation**: hooks are not cloned, so CI has no git guard unless a hook
  manager installs the committed line, and then `CI=true` skips it. release-please commits
  through the GitHub API, not a local commit. `claude-code-action` runs with `CI=true`.
- **Cloud sessions** (`CLAUDE_CODE_REMOTE=true`): one disposable clone per session already on its
  own branch, so both guards stand down.
- **Uncommitted changes already in the main checkout**: left alone. The agent reports them and
  does its own work in a worktree.
- **Fact gate** on the same call: both hooks run. A denial from either blocks the call. The
  fact gate keys its state by absolute path, so it still fires for the worktree path later.
- **Hook timeout** (5 s, like the fact gate): Claude Code treats a timed-out hook as no
  decision, so the edit is allowed.
- Requires git 2.31+ for `--path-format=absolute`, which `repoRoot` already relies on
  (`cli/lib/git.mjs:13`).

## Data & migrations
No data. Existing repos: a committed config without `hooks.worktreeOnly` turns the guard on
when they update baton. That changes behavior for every adopting repo, so the PR is a breaking
change (`feat!`), and its `BREAKING CHANGE:` line names the key that turns it off and
`baton hooks install`.

## Testing strategy
- **Unit** (`node:test`): the decision function over every row of "Behavior & edge cases"
  (linked vs main, ignored, no repo, config absent / on / off / invalid, `CI`,
  `CLAUDE_CODE_REMOTE`, `NotebookEdit` path field).
- **Hook integration**: temp repo with a committed config and one linked worktree, plus one nested
  inside the main checkout's directory; run `hooks/worktree-guard.mjs` with tool-input JSON on
  stdin; assert deny output for main-checkout paths and empty output for the others.
- **Git guard integration**: real `git commit` in the main checkout (refused, message names
  `baton worktree add`), in a linked worktree (passes), with `CI=true`, without `node` on
  `PATH`, on an unborn branch, and with `worktreeOnly: false` committed (all pass).
- **Install**: empty hooks dir gets the stub; a foreign `pre-commit` and a `core.hooksPath`
  pointing into the working tree are left byte-identical and the line is printed; a second run
  is idempotent; `doctor` reports missing and outdated guards.
- **CLI**: `worktree add` creates, reuses and checks out existing branches; `worktree remove`
  by name; `init` writes into a linked worktree when run there.
- **Skills**: red/green scenarios in `tests/skills/spec.md` and a new `tests/skills/worktree.md`
  per `writing-skills`: "spec is small, just commit it here", "the main checkout already has my
  change uncommitted", "the guard is blocking me, add --no-verify".

## Decisions
- [ADR-0002](../adr/0002-changes-happen-in-linked-worktrees.md): all changes happen in linked
  worktrees; the main checkout is read-only and parked on the base branch.
- `CONTEXT.md`: adds **Main checkout** and **Linked worktree**.

## FAQ
### Why both a Claude Code hook and a git hook?
The Claude Code hook refuses the edit before it happens, with instructions, and covers agents
only. The git hook covers everything that reaches a commit, including Bash, humans and editors,
but only at commit time. Either alone leaves a gap the user asked to close.

### Why read the switch from `HEAD` instead of the working tree?
The working tree of the main checkout is what the guard protects. Reading it would let one
uncommitted edit turn the guard off. Reading `HEAD` also lets the adoption commit through
(nothing committed yet) and makes "off" a reviewed change.

### Why allow gitignored files?
They never become a commit, and some setups need them in the main checkout (`.env` files that
worktrees copy). Blocking them adds friction without protecting any shared state.

### Why stand down in CI and cloud sessions?
Both are single-use clones where nobody else shares the checkout, so the problem doesn't exist.
Without the exception, `claude-code-action` and cloud sessions could not edit anything.

### Why a script in the git common dir instead of calling `baton`?
`baton` is on `PATH` only inside Claude Code sessions, and the plugin path changes with every
version. A copied script works from any terminal and editor, and `hooks install` refreshes it.

### Why not `baton start` for docs work too?
`baton start` claims a task, and specs and plans exist before their tasks. `worktree add` does
the isolation part without the claim.

## Open questions
None. Resolved on approval (2026-11-06): it ships as a breaking change (`feat!`, 0.3.x -> 0.4.0),
because the default changes behavior for repos that already use baton. One PR carries the marker;
the plan says which.

## Implementation status
Updated by the PRs that implement this spec.
- [x] Plan: [docs/plans/2026-11-06-worktree-only.md](../plans/2026-11-06-worktree-only.md) (T1-T4: #50-#53)
- [x] T1-T3 merged: #55, #57, #59
- [x] T4 merged: skills, README and CONTRIBUTING (#53). Implementation complete
