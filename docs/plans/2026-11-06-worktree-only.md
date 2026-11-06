# Worktree-only changes — Implementation Plan

- Spec: [docs/specs/2026-11-06-worktree-only.md](../specs/2026-11-06-worktree-only.md)
- Date: 2026-11-06
- Status: approved

## Overview
Four tasks, cut by file ownership. T1 is the foundation: the config key and
`baton worktree add`, which every deny message and skill points at. After T1 merges, T2 (the
Claude Code hook) and T3 (the git guard, `baton hooks install`, doctor and context) run in
parallel. T4 (skills and docs) starts after T3, because it documents `baton hooks install` and
the new init step.

- T1: `hooks.worktreeOnly`, `baton worktree add`, `worktree remove <name>`, init in the current checkout
- T2: the Claude Code `PreToolUse` guard. **The only breaking PR** (`feat(hooks)!`)
- T3: the git guard, `baton hooks install`, `baton doctor` and the session context
- T4: the skills, README and CONTRIBUTING

T2 turns the guard on for every repo that already uses baton, so it alone carries the `!` and
the `BREAKING CHANGE:` line. T1, T3 and T4 are plain `feat` (or `docs` for prose that changes no
agent behavior; skill text is `feat`). **Don't cut a release until all four have merged**, or a
release ships the deny message without the skills and context that explain it.

## Contract
- Config key, owned by T1: `hooks.worktreeOnly`, boolean, default `true`. T2 and T3 read it from
  `git show HEAD:.baton/config.json` in the main checkout, never through `loadConfig`. A committed
  config without the key means on; a missing, unreadable or invalid committed config means off.
- Command, owned by T1: `baton worktree add <name> [--setup] [--json]`. Branch and directory are
  `slugify(name)` under `worktreeBase`. `--json` prints `{ path, branch, created }`. T2's deny
  message, T3's refusal message and context line, and T4's skills name it exactly like this.
- Command, owned by T3: `baton hooks install [--json]`. T4 documents it; T3's context line and
  doctor finding name it.
- Files, owned by T3: the script lives at `<git common dir>/baton/worktree-guard.sh` with first
  line `# baton worktree-guard v1`; a stub `pre-commit` carries `# baton:worktree-guard`. The
  manager line is the one in the spec's "Git guard" section, byte for byte.
- Deny and refusal texts: the spec's "Change in a nutshell" (T2) and "Git guard" (T3) blocks.
- Stand-down rule, shared by T2, T3's script and T3's doctor check: `CI=true` or
  `CLAUDE_CODE_REMOTE=true` means no guard and no finding.

## Impact
- **Affected call paths and consumers:**
  - `hooks/hooks.json` gets a second `PreToolUse` entry. Every `Edit`, `Write`, `MultiEdit` and
    `NotebookEdit` in every baton session spawns one more `node` process with up to four `git`
    calls (5 s timeout; a timeout allows the edit). The fact gate is unchanged and keeps its
    own matcher.
  - `createWorktree` (`cli/baton.mjs:389`) is generalised to take a branch name, so
    `baton start` goes through the changed code. Its behavior must not change.
  - `init()` writes to `currentTop()` instead of `repoRoot()`. Run in the main checkout, the
    result is identical to today.
  - `doctor()` gains findings and exits 1 when the guard is missing. Anything that treats
    doctor's exit code as a gate (the `baton:init` and `baton:release` skills re-run it) now
    sees the finding until `baton hooks install` runs.
  - `buildContext` swaps the first always-rule when the key is on, so every session's start
    text changes.
- **Data and migrations:** none. A committed config without the key turns the guard on when the
  repo updates to the release containing T2. That is the breaking change.
- **Tests and downstream checks that must stay green:** `cli/test/tasks.test.mjs` (config
  validation, `start`, branch names), `cli/test/features.test.mjs` (fact gate `classify` and
  `questions`, context), `cli/test/release-templates.test.mjs`, `claude plugin validate .`
  (`hooks.json` shape), gitleaks. The trigger evals only grade which skill fires, so the guard
  does not affect them; the scaffold stays as it is.
- **CI:** GitHub CI sets `CI=true`, so the guards stand down there. Tests that assert a denial
  or a refused commit must build the child environment explicitly and delete `CI` and
  `CLAUDE_CODE_REMOTE`, or they pass locally and fail in CI. release-please commits through the
  API and never runs a local hook.
- **Rollout:** merge T1, then T2 and T3, then T4; then cut 0.4.0 with `baton:release`. The
  guard reaches a repo when its contributors update the plugin. In this repo, run
  `baton hooks install` once per clone after updating; `baton doctor` reports clones that
  haven't.
- **Rollback:** a repo turns both guards off by merging `"hooks": { "worktreeOnly": false }`.
  For baton itself, reverting T2 removes the Claude Code hook; removing the git guard from a
  clone is deleting the two files `baton hooks install` names.

## Dependency graph
```
T1 ──> T2
T1 ──> T3 ──> T4
```
Can start immediately: T1. After T1 merges, T2 and T3 in parallel. T4 after T3.

## Tasks

### T1: `hooks.worktreeOnly` and `baton worktree add`
- Priority: 1
- Depends on: none
- Owns: `cli/lib/config.mjs`, `templates/config.example.json`, `cli/baton.mjs` (only `USAGE`,
  `init()`, `createWorktree()`, `worktree()` and `start()`'s call to `createWorktree`),
  `cli/test/worktree-cli.test.mjs` (new), `cli/test/tasks.test.mjs` (config validation cases)
- Touches (read-only or additive): `cli/lib/git.mjs` (`worktreeBase`, `listWorktrees`; add a
  helper only if needed), `cli/lib/util.mjs` (`slugify`)
- Acceptance:
  - [ ] `DEFAULT_CONFIG.hooks.worktreeOnly` is `true`, with a one-line comment like `factGate`'s.
    A config without the key loads with `true`. `validateConfig` rejects a non-boolean with a
    message naming `hooks.worktreeOnly`.
  - [ ] `baton init` writes `"worktreeOnly": true` explicitly. Run inside a linked worktree, it
    writes `.baton/config.json` and the docs dirs there and leaves the main checkout unchanged.
    Run in the main checkout, its output is identical to today's.
  - [ ] `baton worktree add orgs-spec` in a repo with `origin/main` creates
    `<worktreeBase>/orgs-spec` on a new branch `orgs-spec` from `origin/main` with no upstream
    (`git rev-parse --abbrev-ref orgs-spec@{u}` fails), and prints the path.
  - [ ] A second `baton worktree add orgs-spec` prints the same path and exits 0. With a local
    branch `orgs-spec` and no worktree, it checks that branch out instead of creating one.
  - [ ] `--setup` runs the configured `setup` steps in the new worktree; without it, none run.
    `--json` prints `{ path, branch, created }`. A name that slugifies to empty is an error.
  - [ ] `baton worktree remove orgs-spec` removes that worktree, keeps the branch, and refuses
    uncommitted changes without `--force`. `baton worktree remove 12` still works for tasks.
  - [ ] `baton start <n>` behaves as before (same branch name, path, reuse of an existing
    worktree).
  - [ ] `make ci` passes.
- Tests first: `defaultConfig_worktreeOnly_on`, `validateConfig_rejects_non_boolean_worktreeOnly`,
  `worktree_add_creates_untracked_branch_from_remote_base`, `worktree_add_is_idempotent`,
  `worktree_add_checks_out_existing_branch`, `worktree_add_setup_only_with_flag`,
  `worktree_remove_by_name`, `init_writes_into_current_worktree`
- Notes: generalise `createWorktree(root, config, branch)` and keep the task-number lookup in
  `start()`. Build test repos with a bare "origin" in a temp dir, like the existing tasks tests.
  Commit type `feat(cli)`. Tick the spec's Implementation status only for what this PR delivers.

### T2: the Claude Code worktree guard
- Priority: 1
- Depends on: T1
- Owns: `hooks/worktree-guard.mjs` (new), `hooks/hooks.json`, `cli/test/worktree-guard.test.mjs`
  (new)
- Touches (read-only or additive): `hooks/fact-gate.mjs` (pattern only, not edited)
- Acceptance:
  - [ ] `hooks.json` registers `hooks/worktree-guard.mjs` as a second `PreToolUse` hook with
    matcher `Edit|Write|MultiEdit|NotebookEdit` and timeout 5. The fact gate entry is unchanged.
    `claude plugin validate .` passes.
  - [ ] An exported pure function decides from `{ gitDir, commonDir, top, ignored, config, env }`
    and returns allow or the deny text. It allows on: `CI=true`, `CLAUDE_CODE_REMOTE=true`, git
    failure, `gitDir !== commonDir`, ignored path, committed config absent, invalid, or with
    `worktreeOnly: false`. Otherwise it denies.
  - [ ] Hook integration, in a temp repo with a committed config, one sibling linked worktree and
    one nested at `.claude/worktrees/x`: an `Edit` of a tracked file and a `Write` of a new file
    in a new directory in the main checkout print a deny whose reason matches the spec's
    "Change in a nutshell" text with the paths filled in. The same relative paths in both
    worktrees print nothing.
  - [ ] A `NotebookEdit` reads `tool_input.notebook_path`. A gitignored `.env` in the main checkout,
    a path inside `.git`, a path outside any repo, and a repo whose `HEAD` has no
    `.baton/config.json` print nothing. A working-tree-only edit that sets `worktreeOnly: false`
    does not turn the guard off; a committed one does.
  - [ ] Malformed stdin, a missing `file_path`, or a thrown error prints nothing (allow).
  - [ ] `make ci` passes, also with `CI=true` set (the tests clear it in child environments).
- Tests first: `decide_allows_linked_worktree`, `decide_denies_main_checkout`,
  `decide_allows_ignored_path`, `decide_allows_without_committed_config`,
  `decide_reads_switch_from_head_not_worktree`, `decide_stands_down_in_ci_and_cloud`,
  `hook_denies_new_file_in_new_dir_in_main_checkout`, `hook_allows_nested_worktree`,
  `hook_reads_notebook_path`, `hook_fails_open_on_bad_input`
- Notes: keep the hook standalone like the fact gate (no imports from `cli/`), so it never
  breaks on a CLI change. Resolve the path against the input's `cwd` and walk up to the nearest
  existing directory before calling `git -C`. Use
  `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel` and
  `git check-ignore -q`. PR title: `feat(hooks)!: every edit happens in a linked worktree`.
  The body's `BREAKING CHANGE:` line says the guard is on by default, that
  `"hooks": { "worktreeOnly": false }` in `.baton/config.json` turns it off, and that
  `baton hooks install` adds the commit guard.

### T3: the git guard, `baton hooks install`, doctor and context
- Priority: 1
- Depends on: T1
- Owns: `templates/git-hooks/worktree-guard.sh` (new), `cli/lib/git-guard.mjs` (new),
  `cli/baton.mjs` (only the `hooks` command, its `USAGE` line, and `doctor()`),
  `cli/lib/context.mjs`, `skills/init/SKILL.md`, `cli/test/git-guard.test.mjs` (new),
  `cli/test/features.test.mjs` (context cases)
- Touches (read-only or additive): `cli/lib/git.mjs`
- Acceptance:
  - [ ] `worktree-guard.sh` is POSIX `sh` with first line `# baton worktree-guard v1`. In a temp
    repo with the guard installed and a committed config: `git commit` and `git commit --amend`
    in the main checkout exit 1 with the spec's refusal text; a commit in a linked worktree
    succeeds; `CI=true`, no `node` on `PATH`, an unborn branch, and a committed
    `worktreeOnly: false` all let the commit through.
  - [ ] `baton hooks install` writes the script to `<common dir>/baton/worktree-guard.sh` and, when
    the resolved hooks directory is inside the common dir and has no `pre-commit`, an executable
    stub with `# baton:worktree-guard`. A second run rewrites both and reports no change in
    behavior.
  - [ ] With a foreign `pre-commit`, or `core.hooksPath` pointing into the working tree
    (`.githooks/`, `.husky/`), install leaves every existing file byte-identical, writes only the
    script, and prints the manager line from the Contract. The printed output always names the
    files written and how to remove them.
  - [ ] An exported `guardStatus(root)` returns `installed`, `outdated` (script differs from the
    template) or `missing`, counting `lefthook.yml`, `.lefthook.yml` and
    `.pre-commit-config.yaml` that mention `baton/worktree-guard.sh` as wired.
  - [ ] With `worktreeOnly` on, `baton doctor` reports a missing or outdated guard ("run
    `baton hooks install`") and a main checkout that is not on the base branch. With it off, or
    with `CI=true` or `CLAUDE_CODE_REMOTE=true`, neither finding appears.
  - [ ] With `worktreeOnly` on, the session context's first always-rule is the spec's
    worktree rule, and a guard that is not installed adds one line naming `baton hooks install`.
    With it off, the context is identical to today's.
  - [ ] `baton:init` step 9 says the adoption commit is the one commit made in the main
    checkout, a new step after it runs `baton hooks install` and shows the result, and re-runs of
    single steps happen in a worktree from `baton worktree add`.
  - [ ] `make ci` passes, also with `CI=true` set.
- Tests first: `git_guard_refuses_commit_in_main_checkout`, `git_guard_allows_linked_worktree`,
  `git_guard_allows_when_ci_or_no_node_or_unborn`, `git_guard_reads_switch_from_head`,
  `install_writes_stub_into_empty_hooks_dir`, `install_leaves_foreign_hook_untouched`,
  `install_respects_core_hooks_path_in_worktree`, `install_is_idempotent`,
  `guardStatus_detects_outdated_script`, `doctor_reports_missing_guard_only_when_on`,
  `context_uses_worktree_rule_when_on`
- Notes: the script must not reference the plugin path; read the template from
  `${PLUGIN_ROOT}/templates/git-hooks/` at install time. Parse the committed JSON with
  `node -e` reading stdin; any failure exits 0. In `context.mjs`, swap the rule inside
  `buildContext` by matching the current first rule's text, without reordering or editing other
  `ALWAYS_RULES` entries (see Cross-plan overlap). Commit type `feat(cli)`.

### T4: skills, README and CONTRIBUTING
- Priority: 2
- Depends on: T3 (and T1 through it)
- Owns: `skills/spec/SKILL.md`, `skills/plan/SKILL.md`, `skills/backlog/SKILL.md`,
  `skills/retro/SKILL.md`, `skills/integrate/SKILL.md`, `tests/skills/spec.md`,
  `tests/skills/worktree.md` (new), `README.md`, `CONTRIBUTING.md`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `baton:spec` runs `baton worktree add <topic>` before writing the spec (step 6) and
    writes, commits and iterates there; after approval it pushes and opens the PR with
    `gh pr create`.
  - [ ] `baton:plan` writes the plan in the spec's worktree while that branch is unmerged,
    otherwise in a new one from `baton worktree add`, with the same PR rule.
  - [ ] `baton:backlog` step 4 and `baton:retro` step 4 commit in a worktree from
    `baton worktree add`, never in the main checkout.
  - [ ] `baton:integrate` step 4 fast-forwards the main checkout after the merge and cleanup
    (`git -C <main checkout> pull --ff-only`), and says to report rather than fix a main checkout
    that can't fast-forward.
  - [ ] README documents `hooks.worktreeOnly` (default on, how to turn it off),
    `baton worktree add` and `baton hooks install`, and the row on local execution covers
    non-task work. CONTRIBUTING says every change, docs included, happens in a worktree.
  - [ ] `tests/skills/worktree.md` and `tests/skills/spec.md` hold red/green scenarios run with
    fresh subagents: "the spec is small, just commit it here", "the main checkout already has
    my change uncommitted" (leave it, report it, work in a worktree), "the guard is blocking me,
    add --no-verify" (refuse). Each records the red rationalizations and the green result.
  - [ ] `make ci` passes.
- Tests first: the red scenarios in `tests/skills/worktree.md`, run without the changed text.
- Notes: follow `.claude/skills/writing-skills/SKILL.md`. Keep each skill addition to a sentence
  or two and name commands exactly as in the Contract. Commit type `feat(skills)`. Mark the spec's
  Implementation status complete in this PR, since it merges last.

## Cross-plan overlap
The dependency-vetting plan runs in parallel. Files both plans touch, with this plan's exact
edit, so the backlog can sequence them:

| File | This plan | Dependency-vetting plan | Sequencing |
|---|---|---|---|
| `cli/lib/context.mjs` | T3: in `buildContext`, replace the first `ALWAYS_RULES` entry with the worktree rule when `worktreeOnly` is on (matched by text), and add one line when the git guard is missing. The array itself is not edited. | Appends one rule to `ALWAYS_RULES`. | Either order. The second PR rebases; the edits don't share lines if the deps rule is appended at the end of the array. |
| `cli/test/features.test.mjs` | T3: adds context test cases at the end of the context section. | May add a context test for its rule. | Either order; append-only on both sides. |
| `CONTEXT.md` | Already edited on the spec branch: adds **Main checkout** and **Linked worktree**. | Adds **Accepted advisory** on its spec branch. | The second spec PR to merge resolves the conflict by keeping all three terms in alphabetical order. |
| `README.md` | T4: `hooks.worktreeOnly`, the two commands, local execution row. | Only if it adds the skill to a README list. | Either order; separate sections. |

No other overlap: this plan does not edit `skills/workflow/SKILL.md`, `skills/implement/SKILL.md`,
`reviewers/security.md`, `stacks/**`, `skills/deps/**`, `tests/skills/deps.md` or `evals/**`.
Once T2 is released, the dependency-vetting tasks, like every other task, are edited in their
`baton start` worktrees; nothing in that plan needs to change.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| `hooks.worktreeOnly`, default on, validated, written by init | T1 |
| Guards read the switch from the main checkout's committed `HEAD` | T2 (hook), T3 (script) |
| Claude Code hook denies Edit/Write/MultiEdit/NotebookEdit in the main checkout, with the message | T2 |
| Linked, nested, ignored, outside-repo, `.git`, no-config, submodule, bare: allowed | T2 |
| Git guard refuses commits (incl. `--amend`) in the main checkout | T3 |
| Install never changes a foreign hook or the working tree; prints the manager line | T3 |
| Both guards stand down in CI and cloud sessions; fail open on errors | T2, T3 |
| `baton worktree add <name>` (idempotent, `--no-track`, `--setup`, `--json`) | T1 |
| `baton worktree remove <name>` | T1 |
| `baton init` writes into the current checkout | T1 |
| `baton doctor` reports a missing or outdated guard and a main checkout off the base branch | T3 |
| Session context: worktree rule and missing-guard line | T3 |
| Skills: spec, plan, backlog, retro, integrate | T4 |
| Skill: init (adoption commit, `hooks install` step) | T3 |
| Breaking change shipped as `feat!` with `BREAKING CHANGE:` | T2 |
| Testing: unit, hook integration, git guard, install, CLI, skill scenarios | T1, T2, T3, T4 |
| ADR-0002, CONTEXT.md terms | Done on the spec branch |
