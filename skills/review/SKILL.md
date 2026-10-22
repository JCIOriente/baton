---
name: review
description: Use when a task's changes are verified and need review before integration, when asked to review a task or PR in a baton repo, or when review feedback arrives on a PR.
argument-hint: "[task number | PR number]"
---

# Review

Reviews are done by **fresh-context subagents** that did not write the code, using briefs
that each focus on one angle. The author's context makes you blind to your own assumptions,
so never review your own diff in the same context you wrote it in.

## 1. Gather inputs

- Worktree path and diff command: `git diff <baseBranch>...HEAD` (or `gh pr diff <n>` for a PR)
- Task: `baton show <n>` (save the text to a temp file)
- Spec and plan paths linked from the task
- Guide paths from the `<baton>` block
- Reviewer briefs: `baton reviewers --json`. It lists `spec-compliance` first, then general
  angles (code quality, security, tests, silent failures) and the stack reviewers whose files
  this branch's diff touches. Skipped ones are listed. Use `--all` to include them anyway.

## 2. Stage one: spec compliance (gate)

Dispatch **only** the `spec-compliance` brief first. Fill in its placeholders (every occurrence)
(`{{DIFF_CMD}}`, `{{WORKTREE}}`, `{{TASK}}`, `{{SPEC}}`, `{{GUIDES}}`) and pass it as the subagent
prompt. Paste the content; don't ask the subagent to fetch the brief.

- `CHANGES_REQUIRED`: the implementation is missing something or built something extra. Fix
  it (the implementer, not the reviewer), run `baton verify`, and re-run this stage. Quality
  review on code that does the wrong thing is wasted.
- `APPROVE`: continue.

## 3. Stage two: quality angles, in parallel

Dispatch all remaining briefs **in one message** so they run concurrently. Use the most capable
model available for reviewers. Review is where judgment matters most.

Then consolidate:
1. Merge duplicates. If two angles flag the same line, keep the clearer finding.
2. **Check each finding against the code** before accepting it. Reviewers can be wrong.
   Drop findings without a concrete failure scenario.
3. Fix `blocker` and `major` findings, each with a test when it is a behavior bug. `minor`
   findings are fixed or listed in the PR description. Never ignore them silently.
4. After fixes: `baton verify`, then **re-dispatch only the angles that had findings**. Repeat
   until all approve.

A task is reviewed when spec compliance and every quality angle report `APPROVE`. Record the
consolidated outcome (angles run, findings fixed, minors deferred) in the **Reviews** section of
the PR body (`baton:integrate`).

## Built-in alternatives

Claude Code's `/code-review` and `/security-review` can run in addition to the briefs, e.g.
as a final pass on the whole PR. They don't replace spec compliance, which only baton checks.

## Receiving human review on a PR

- Verify each comment against the code before acting. If a comment is wrong, reply with the
  technical reason. Don't comply just to be agreeable.
- Fix confirmed issues one at a time (with a test for behavior bugs), run `baton verify`, push,
  and reply describing what changed.
- Recurring comments are a signal for `baton:retro`: the convention may need to be written down.
