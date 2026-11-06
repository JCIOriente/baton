# ADR-0002: Every change happens in a linked worktree

- Status: accepted
- Date: 2026-11-06
- Deciders: Arnold Gandarillas
- Related: [worktree-only spec](../specs/2026-11-06-worktree-only.md)

## Context
Several agent sessions and people work in one clone at the same time. They shared the main
checkout for anything that was not a claimed task (specs, plans, lessons, config), so one
session's branch switch or uncommitted edits ended up under another session's work. baton
already isolated task work in worktrees, but only as an instruction, and nothing said where
the rest should happen.

## Options considered
1. **Instruction only**: extend the session rule to all changes. Cheap, but agents skip
   instructions under pressure, and humans and Bash calls are not covered.
2. **Claude Code hook only**: refuses agent edits in the main checkout before they happen.
   Misses Bash writes, editors and humans.
3. **Claude Code hook plus a git pre-commit guard**, on by default with a repo-level switch:
   agents are stopped at the edit with instructions, and anything else is stopped at the commit.

## Decision
Option 3. The main checkout stays parked on the base branch and only fast-forwards. Every
change, docs included, is made and committed in a linked worktree: `baton start <n>` for a
task, `baton worktree add <name>` for anything else. The guards are on unless a repo commits
`"hooks": { "worktreeOnly": false }`; they read that switch from the main checkout's `HEAD`,
fail open on internal errors, ignore gitignored files, and stand down in CI and cloud sessions.

## Consequences
- New skills and CLI commands that write files must say which worktree they write in, never
  the main checkout. A skill that commits docs creates or reuses a worktree first.
- `baton init`'s adoption commit is the only commit made in the main checkout.
- Each clone runs `baton hooks install` once; `baton doctor` and the session context report
  when it hasn't.
- Branches that are not tasks open PRs with `gh pr create` until `baton done` supports them.
- Bash commands can still change the main checkout's working tree, and only the commit is
  refused. Revisit with a Bash-matcher hook if agents keep doing that.
