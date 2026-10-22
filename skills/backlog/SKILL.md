---
name: backlog
description: Use when an approved plan needs to become GitHub issues, or when asked what is next, what is in progress, to create, triage or reprioritize a task in a baton repo.
argument-hint: "[plan path | next | status]"
---

# Backlog

GitHub Issues is the source of truth for task state and ownership. Plan documents and
markdown lists are views of it, never authoritative. All operations go through `baton`.

Status is a single label: `status:ready` -> `status:in-progress` -> `status:review` -> closed,
plus `status:blocked`. Priority is `priority:p0`..`p3`. Dependencies are a
`Depends on: #12, #14` line in the issue body.

## Plan -> issues

1. Make sure the labels exist: `baton labels` (idempotent).
2. Create issues **in dependency order** (topological), so every `Depends on` can refer to
   issues that already exist. Keep a T-id -> issue-number map as you go.
3. For each task, write the body from `${CLAUDE_PLUGIN_ROOT}/templates/task.md` to a temp
   file, then:
   ```bash
   baton create --title "<title>" --body-file <file> --priority <0-3> --depends-on 12,14 --ready
   ```
   Only add `--ready` when the task is fully specified. Unclear tasks stay in triage.

   **An issue is a prompt for an agent with zero context.** Before marking it ready, check
   that someone who reads only this issue, the linked spec and the guides could do it:
   - owned files listed, and what is out of scope
   - every acceptance criterion checkable, plus the tests to write first
   - existing patterns to follow named by path
   - error cases, permissions and data changes stated, if any apply
4. Write the issue numbers back into the plan doc next to each T-id and commit. Then report the
   map and what can start in parallel right away (`baton next`).

## Inspecting

| Ask | Command |
|---|---|
| What can I pick up? | `baton next` (ready, unassigned, dependencies closed, by priority) |
| Everything open | `baton list` / `baton list --status in-progress` |
| My work | `baton list --mine`, `baton status` (local worktrees) |
| One task | `baton show 42` (includes dependency state) |
| Re-prioritize / block | `baton status-set 42 blocked`, or edit `priority:` labels with `gh` |
| Release finished dependencies | `baton unblock` (blocked tasks whose `Depends on` are all closed -> ready) |

Use `--json` when you need to process the output.

## Ad-hoc tasks

Bugs or requests outside a plan still become issues. Use the same template with a short
problem statement, acceptance criteria and, for bugs, reproduction steps. If it is bigger than
one task, it needs `baton:spec` first.

## Don't

- Don't change `status:in-progress` on a task claimed by someone else. Ask them, or the user.
- Don't close issues by hand. Closing happens when the PR merges (`Closes #N`).
- Don't keep a parallel TODO list in markdown as the real state.
