---
name: review
description: Use when a task's changes are verified and need review before integration, when asked to review a task or PR in a baton repo, or when review feedback arrives on a PR.
argument-hint: "[task number | PR number]"
---

# Review

Reviews are done by **fresh-context subagents** that did not write the code, one brief per
angle. Never review your diff in the context you wrote it in.

## 1. Gather inputs

Diff command (`git diff <baseBranch>...HEAD` or `gh pr diff <n>`), task text (`baton show <n>`,
saved to a file), linked spec and plan, guide paths from `<baton>`, and briefs from
`baton reviewers --json`; tell each its focus files and that it may read others. Record
`git rev-parse HEAD` before each dispatch.

**Dispatch each brief, re-reviews too, as written with placeholders filled, plus focus files.
Add nothing:** no "don't flag X", "at most minor" or "the plan chose". Decide on findings after
they return.

## 2. Stage one: spec compliance (gate)

Dispatch **only** the `spec-compliance` brief first, every placeholder filled, its content
pasted as the prompt. `CHANGES_REQUIRED` goes to the fix loop (step 4) before stage two.
`APPROVE`: continue.

Findings labelled `plan-mandated` wait outside the loop until settled by the spec (spec beats
plan); ask the user for a decision if the spec doesn't settle it. Settled for the spec: an open
finding. Settled for the plan: record it in the PR body's second paragraph.

## 3. Stage two: quality angles, in parallel

Dispatch all remaining briefs **in one message**, on the most capable model. Then:
1. Merge duplicates, keeping the clearer finding.
2. **Check each finding against the code**: reviewers can be wrong. Drop findings without a
   concrete failure scenario.
3. Check `## Declined to judge` items no other reviewer covered likewise: a real defect becomes
   a finding; note the rest as checked. Checking alone never starts a round.
4. Open findings go to the fix loop. Never ignore one silently.

Built-in `/code-review` or `/security-review` may add a pass, never replace spec compliance.

## 4. Fix loop

A round is one fix plus one scoped re-review. Stages one and two share **5 rounds per task**.

- Rounds 1-3 are fixed by the author: this session in `baton:implement`, the same implementer
  in `baton:parallel` (resumed, or re-dispatched with its brief, last report and open findings).
  Rounds 4-5: a fresh fixer on the most capable model, from
  `${CLAUDE_PLUGIN_ROOT}/templates/implementer-brief.md` with the open findings and its
  prior-attempts line filled.
- Behavior bugs get a test. Minors are fixed in the first round; one still open after it, or
  reported later, is deferred and never starts a round.
- After each fix, `baton verify`, then **always** a re-review, even of one line: a fresh
  subagent from `${CLAUDE_PLUGIN_ROOT}/templates/re-review.md`, findings verbatim,
  `{{FIX_BASE}}` = the HEAD the previous review saw. Its `ROUND:` line says what stays open;
  its out-of-scope items are deferred.
- **Round 5 ends `ROUND: OPEN`: stop.** No round on your own, no `baton done`, no PR. Ask the
  user for a decision per open finding (fix, defer, drop with reason), with the fix history. All
  defer or drop: the round counts as `ROUND: CLEAN`. Any fix: two more rounds, run as rounds
  4-5; open again, ask again.

The task is reviewed at the HEAD every angle approved or, with later commits, the HEAD after the
last clean re-review. Record angles run, findings fixed, deferred items and the user's decisions
in the PR body's second paragraph (`baton:integrate`), then `Reviewed-at: <that HEAD>`.
`baton done` refuses a ready PR without it or with commits after it.

## Receiving human review on a PR

Verify each comment against the code before acting; a wrong one gets a reply with the technical
reason, not compliance. Fix confirmed issues one at a time (a test for behavior bugs),
`baton verify`, push, reply with what changed. Recurring comments are a signal for `baton:retro`.
