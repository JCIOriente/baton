# Session boundaries

Rules for spending a controller session's context across a unit (one spec, `CONTEXT.md`). Read
them when the context grows or after a compaction, and follow them for the rest of the session.

- **One unit per controller session.** End the session at the unit boundary and start the next
  unit in a fresh session, even when the user already named the next spec.
- Delegate reading, implementing, verifying and reviewing to subagents: one pipeline of subagents
  per task. Take back structured results only (PR number, head sha, verify result, findings),
  never file dumps or full logs.
- Send long output (test runs, eval runs, CI logs) to a file and read only the lines you need.
- Wait for CI and merges in background commands, not in polled turns.
- After a compaction, rebuild where things stand from `baton handoff` and the issues, not from the
  summary.
- Parallel sessions own disjoint worktrees and PRs. The session handoff names the other session's
  as leave-alone. Rebasing them after a merge is still fine.
- At the unit boundary (`baton handoff --spec <spec>` shows no open tasks in the unit's group and
  its retro is done): load `baton:handoff`.
