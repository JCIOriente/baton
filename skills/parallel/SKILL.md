---
name: parallel
description: Use when several ready backlog tasks could be worked at the same time, by subagents in this session or by separate agent sessions or developers, or when asked to "run the backlog", "work on several tasks" or "speed this up".
argument-hint: "[max tasks]"
---

# Parallel execution

You are the **controller**. Implementers and reviewers are fresh subagents. You prepare their
context, answer their questions, verify their claims, and integrate. Coordination happens
through the task provider and git, never through shared local files.

## 1. Pick a safe set

```bash
baton next --limit 10 --json
```

Choose tasks that:
- don't depend on each other (directly, or through another open task)
- **don't own the same files** (compare the `Owns:` lines; any overlap means run them one after the other)
- don't all need the same migration or shared-schema change

When in doubt, run fewer. Two clean parallel tasks are better than four that conflict at
integration.

## 2. Claim and prepare, from this session

For each task: `baton start <n> --json`. This claims the task, creates the worktree, runs setup and
records a baseline. Do this before dispatching, so ownership is on GitHub before any agent
starts. If the baseline shows failures that already existed, tell the implementer they are
pre-existing.

## 3. Dispatch implementers

Fill `${CLAUDE_PLUGIN_ROOT}/templates/implementer-brief.md` for each task and dispatch them
**in one message**. Paste the full task text, the relevant spec excerpt and the guide paths
into the brief. Don't send the implementer to go and read the plan.

**Model choice:** use the cheapest model that can do the job.
- Mechanical tasks (1-2 files, complete spec): a fast model.
- Tasks that integrate across several files: a standard model.
- Design judgment, debugging, all reviewers, fix rounds 4-5: the most capable model.

## 4. Handle implementer status

Each implementer ends with one status:

| Status | Your action |
|---|---|
| `DONE` | Go to review (step 5) |
| `DONE_WITH_CONCERNS` | Read the concerns. A concern that is a user's call goes to the user (below). If they're about correctness or scope, resolve them before review. If they're only notes, record them and review |
| `NEEDS_CONTEXT` | A question that is a user's call goes to the user (below). Otherwise provide what's missing, then re-dispatch |
| `BLOCKED` | Change something: more context, a more capable model, or split the task. If the plan is wrong, escalate to the user. Never re-dispatch unchanged |

**A user's call is never answered by the controller.** It is a choice the spec and plan don't
settle that crosses a module or package boundary, adds a technology or dependency new to the
repo, or contradicts or extends what the spec says the user sees (a new screen, command, option,
flow or state). Put it to the user with the implementer's options and lean, and re-dispatch with
the answer; the other tasks go on meanwhile. Running unattended (no user in the session, e.g. a
Workflow script): park that task, continue the others, and put the question, options and lean in
your final report.

Answer any other question completely before the implementer continues. A choice inside one
module (names, internal signatures, error text the spec doesn't set, helper structure) is a
ruling, never a stop: the implementer makes it and lists it in its report.

## 5. Verify and review each task

Never relay an implementer's "tests pass" as a fact.
1. In its worktree, run `baton verify` yourself and read the diff. Check that
   `git -C <worktree> status --porcelain` is empty and that `git -C <worktree> log <base>..HEAD --oneline`
   matches the commits the implementer reported.
2. Run `baton:review`. Its fix loop sets the rounds, who fixes each and the cap. **Never fix
   in the controller context.**

## 6. Integrate one at a time

Use `baton:integrate` for each approved task. Each later task rebases on the earlier merges
and re-verifies. If two tasks turn out to conflict, integrate the higher-priority one first;
the other rebases and adapts.

## Failure handling

- An implementer went out of bounds or produced unusable work: don't merge partial work.
  Re-dispatch with a corrected brief, or `baton release <n>` and remove the worktree. Use
  `baton worktree remove <n> --force` only after showing the user what would be lost.
- Separate sessions or developers don't need any of this machinery. For them the instruction is
  "`baton start <n>`, then follow the workflow". The issue and the committed docs carry the context.
