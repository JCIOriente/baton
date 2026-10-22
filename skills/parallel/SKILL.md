---
name: parallel
description: Use when several ready backlog tasks could be worked at the same time, by subagents in this session or by separate agent sessions or developers. Picks independent tasks, gives each an isolated worktree and a self-contained brief, and gathers the results.
argument-hint: "[max tasks]"
---

# Parallel execution

Parallel work only pays off when tasks really are independent. Coordination happens through
the task provider and git, never through shared local files.

## 1. Pick a safe set

```bash
baton next --limit 10 --json
```

From the candidates, choose tasks that:
- have no dependency on each other (directly or through another open task)
- **don't own the same files** (check the `Owns:` lines; overlap means serialize them)
- don't all need the same shared migration or schema change

If in doubt, run fewer. Two clean parallel tasks are better than four that conflict at
integration.

## 2. Dispatch

For each task, run `baton start <n>` **from this session** (so the claim and worktree exist
before any agent starts), then give each subagent a self-contained brief:

- the worktree path, with an instruction to work only there
- the task number, with an instruction to read it with `baton show <n>` and follow `baton:implement` then `baton:verify`
- the stack guide paths from the `<baton>` block
- explicit limits: no edits outside owned files, no `baton done`, no merges, no claiming other tasks
- the expected report: commits made, validation output, acceptance criteria -> proof, open questions

For separate sessions or developers, the same brief is simply "`baton start <n>`, then follow
the workflow". The issue and the docs carry all the context.

## 3. Gather the results

When each agent reports back:
1. Don't trust the report as is. In its worktree, run `baton verify` yourself and look at the diff.
2. Review with `baton:review` (fresh context).
3. Integrate **one at a time** via `baton:integrate`. Each later task rebases on the earlier
   merges and re-verifies.

## Failure handling

- If an agent got stuck or went out of bounds, don't merge partial work. Either finish it in its
  worktree or `baton release <n>` and discard the worktree (`baton worktree remove <n> --force`
  only after showing the user what would be lost).
- If two tasks turn out to conflict, integrate the higher-priority one first. The other
  rebases and adapts.
