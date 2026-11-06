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

## 2. Stage one: spec compliance (gate)

Dispatch **only** the `spec-compliance` brief first, every placeholder filled, its content
pasted as the prompt. `CHANGES_REQUIRED` goes to the fix loop (step 4) before stage two: quality
review of code that does the wrong thing is wasted. `APPROVE`: continue.

Findings labelled `plan-mandated` stay out of the loop: rule on each against the spec (spec
beats plan), ask the user before the PR if the spec doesn't settle it, and record the ruling in
the PR body.

## 3. Stage two: quality angles, in parallel

Dispatch all remaining briefs **in one message**, on the most capable model. Then:
1. Merge duplicates, keeping the clearer finding.
2. **Check each finding against the code**: reviewers can be wrong. Drop findings without a
   concrete failure scenario.
3. Open findings go to the fix loop. Never ignore one silently.

`/code-review` and `/security-review` may add a final pass but never replace spec compliance.

## 4. Fix loop

A round is one fix plus one scoped re-review. Stages one and two share **5 rounds per task**.

- Rounds 1-3 are fixed by the author: this session in `baton:implement`, the same implementer
  in `baton:parallel` (resumed, or re-dispatched with its brief, last report and open findings).
  Rounds 4-5: a fresh fixer on the most capable model, from
  `${CLAUDE_PLUGIN_ROOT}/templates/implementer-brief.md` with the open findings and "a prior
  implementer attempted this N times; you own it now".
- Behavior bugs get a test. Minors are fixed in the first round; one still open after it, or
  reported later, is deferred and never starts a round.
- After each fix, `baton verify`, then **always** a re-review, even of one line: a fresh
  subagent from `${CLAUDE_PLUGIN_ROOT}/templates/re-review.md`, findings verbatim,
  `{{FIX_BASE}}` = the HEAD the previous review saw. NOT ADDRESSED findings and new blocker or
  major breakage stay open; out-of-scope observations are deferred.
- **Round 5 ends `ROUND: OPEN`: stop.** No sixth round, no `baton done`, no PR. Give the user
  the open findings and the fix history; record their ruling per finding (fix, defer, drop with
  reason) in the PR body.

A task is reviewed when every angle approved some commit and every later commit was covered by
a re-review ending `ROUND: CLEAN`. Record angles run, findings fixed and deferred items
in the PR body's second paragraph (`baton:integrate`), then
`Reviewed-at: <HEAD after the last clean re-review>`. `baton done` refuses a ready PR without
it or with commits after it.

## Receiving human review on a PR

- Verify each comment against the code before acting. If a comment is wrong, reply with the
  technical reason. Don't comply just to be agreeable.
- Fix confirmed issues one at a time (with a test for behavior bugs), run `baton verify`, push,
  and reply describing what changed.
- Recurring comments are a signal for `baton:retro`: the convention may need to be written down.
