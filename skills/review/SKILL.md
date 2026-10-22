---
name: review
description: Use to review a task's changes before integration, or to process review feedback received on a PR. Checks the diff against the spec, the task's acceptance criteria and boundaries, and the enabled stack guides.
argument-hint: "[task number | PR number]"
---

# Review

## Reviewing a diff

Review against the base branch: `git diff <baseBranch>...HEAD` in the task worktree. For a PR,
use `gh pr diff <n>`.

If you wrote the code, do the review in a **fresh subagent** that gets only the diff, the
issue, the spec and the stack guide paths. The author's context makes you blind to your own
assumptions.

Check, in this order:

1. **Correctness against the task:** every acceptance criterion is implemented and tested.
   Nothing beyond the task's scope.
2. **Boundaries:** only owned files changed substantively, and no edits to files another open
   task owns.
3. **Security and authorization:** every new endpoint, query or UI action enforces
   permissions on the **server**. Client-side checks (e.g. CASL in React) are for UX only and
   must never be the only gate. Check input validation, SQL parameterization, secrets
   in code, and PII in logs.
4. **Tests:** they would fail if the behavior broke, they cover error paths and permission
   denials, and they are not tautological or over-mocked.
5. **Stack guide rules** for the touched stacks, and project conventions.
6. **Simplicity:** dead code, needless abstractions, duplicated logic that has an existing
   helper.

Report findings ranked by severity, each with file:line, the concrete failure scenario, and a
suggested fix. Fewer high-confidence findings are better than many speculative ones.

## Receiving feedback

- Verify each comment against the code before acting. Reviewers can be wrong. If one is,
  reply with the technical reason. Don't comply just to be agreeable.
- Fix confirmed issues one at a time, with a test when it is a behavior bug, then `baton:verify` again.
- Push, and reply on the PR describing what changed.
