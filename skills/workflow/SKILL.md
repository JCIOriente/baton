---
name: workflow
description: Use at the start of any feature, bug fix, refactor or backlog task in a repo that has .baton/config.json, or when unsure which baton skill applies.
---

# baton workflow

You are a contributor inside an engineering workflow, not a free agent. The work moves through
phases. Each phase has an exit condition. You do not skip a gate the project enabled.

## 1. Read the project's workflow

The session context (`<baton>` block) lists the phases, gates, enabled stacks and validation
commands. If it is missing or stale, run `baton config` (the plugin's `bin/` is on PATH).

Default phases, in order:

| Phase | Skill | Exit condition |
|---|---|---|
| spec | `baton:spec` | Spec doc approved by the user and committed |
| plan | `baton:plan` | Plan doc with tasks, dependencies, file boundaries and acceptance criteria, approved |
| backlog | `baton:backlog` | One GitHub issue per plan task, dependencies linked, marked ready |
| implement | `baton:implement` | Task claimed, worked in its own worktree, tests written first, commits made |
| verify | `baton:verify` | `baton verify` passes, and the evidence is shown |
| review | `baton:review` | Diff reviewed against spec, plan task and stack guides; findings resolved |
| integrate | `baton:integrate` | PR open via `baton done`, merged per policy, worktree cleaned up, retro done |

A project can drop phases, reorder them, or add its own. A custom phase is listed as
`Custom phase '<name>': follow <file>`. Read that file and follow it exactly as you would a skill.

## 2. Find where the work is

Decide the phase from evidence, not from what the user's wording suggests:

- A reported bug, failing test, error or build failure -> load `baton:debug` before reading
  code to diagnose it, even if the cause looks obvious. Spotting a likely cause is where
  debugging starts, not a reason to skip it.
- No spec covering this change in the configured specs dir -> **spec** (if `requireSpec`).
- Spec exists, no plan -> **plan**.
- Plan exists, its tasks are not issues yet -> **backlog**.
- The user names a task number, or asks "what's next" -> `baton next` / `baton status`, then **implement**.
- Inside a task worktree (`<baton>` says "working on task #N") -> continue **implement** / **verify**.
- PR open for the task -> **review** / **integrate**.

Small changes still go through the gates, but the artifacts scale down. A one-line bug fix
gets a three-sentence spec section inside the issue, not a design document. If the user
explicitly says to skip a phase, do so and say which gate was skipped.

Supporting skills: `baton:parallel` (several tasks at once), `baton:debug` (unknown cause),
`baton:retro` (turn lessons into conventions).

Bugs: once `baton:debug` has confirmed the cause, continue from the phase the fix needs.

## 3. Rules that hold in every phase

- **The task provider is the source of truth** for who owns what. Never edit a task that
  another person or session has claimed. Never mark work done that you did not verify.
- **One task, one worktree, one branch.** Do not edit files of a task from another checkout.
- **Stay inside the task's boundaries.** If you need to touch files the plan assigned to
  another task, stop and say so. Don't quietly expand scope.
- **Stack guides apply.** Before writing code in a stack listed in `<baton>`, read its guide.
  Project conventions override stack guides.
- **Claims of success need evidence.** Show command output, not adjectives.

## 4. Hand-offs

At the end of each phase, state in one or two lines what was produced (paths, issue numbers,
PR URL) and what the next phase is. When the user wants to continue in another session, the
issue and the committed docs must be enough for that session to pick up the work. Do not rely
on chat history.
