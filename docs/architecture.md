# Architecture

How baton splits the work between GitHub, git worktrees, skills and the `baton` CLI, and the
guards that keep the workflow honest.

| Concern | Where it lives |
|---|---|
| Shared task state (ownership, status, dependencies, history) | GitHub Issues: labels, assignees, `Depends on: #N`, claim marker comments |
| Local execution | Every change happens in a linked worktree. `baton start <n>` creates one per task (`.worktrees/task-<n>-<slug>`) and runs `setup` and a baseline. `baton worktree add <name>` creates one per spec, plan or other non-task change. `baton worktree clean` removes worktrees whose PRs are merged. It keeps dirty worktrees and those with open PRs or no PR (`--dry-run` previews the cleanup). The main checkout stays on the base branch and only fast-forwards. No shared mutable local files |
| Integration | `baton verify` (project-defined commands) -> review (spec compliance, then quality angles) -> `baton done` (PR `Closes #N`) -> merge policy |
| Learning | `baton:retro` turns review and verification evidence into convention/ADR changes, reviewed like code. Nothing is learned privately |
| Workflow definition | `.baton/config.json` in each project, falling back to defaults |
| Judgment (when and why) | `skills/*/SKILL.md` |
| Mechanics (how, the same way every time) | `baton` CLI (`cli/`, zero dependencies, on PATH via `bin/`) |
| Coding rules | `stacks/*.md`, opt-in per project. `common.md` always applies |
| Review angles | `reviewers/*.md`, chosen by `baton reviewers` from the enabled stacks |

## Claims

GitHub has no atomic compare-and-set, so `baton claim` posts a marker comment, re-reads the
thread, and the earliest claim since the last release wins. The loser rolls back automatically.
Markers count only when the comment author matches the claimed user.

## Fact gate (opt-in)

With `hooks.factGate`, the first edit of each file per session is refused once, until the agent
states facts about it: importers, affected API, data, and the user's instruction. It's adapted
from ECC's gateguard.

## Worktree guard (on by default)

With `hooks.worktreeOnly`, nothing is edited or committed in the main checkout. A Claude Code
hook denies edits to tracked and new files there (gitignored files are allowed) and tells you
how to create a worktree: `baton start <n>` for a task, `baton worktree add <name>` for anything
else.

`baton hooks install` adds a git `pre-commit` guard per clone that refuses commits there from
anyone. It never changes an existing hook, a hook manager's setup or a hooks directory in the
working tree (`.husky/`, `.githooks/`); it prints the line to add instead. `baton doctor` and
the session-start hook report when a clone lacks the guard. The guards also refuse edits and
commits in a worktree outside `.worktrees/` and print the `git worktree move` command that fixes it.

Both guards read the switch from the main checkout's committed `HEAD`, allow the action on any
internal error, and are disabled when `CI` or `CLAUDE_CODE_REMOTE` is `true`. A repo turns them
off by merging `"hooks": { "worktreeOnly": false }` into `.baton/config.json`.

## Cross-tool

All state and logic live in the CLI and in plain Markdown, so an adapter for Codex or another
agent only has to generate an `AGENTS.md` that points to the same skills and `baton` commands.
This adapter is not built yet.
