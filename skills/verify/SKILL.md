---
name: verify
description: Use before claiming any task, fix or change is done, passing, or ready for review. Runs the project's validation commands and requires fresh evidence before any success claim.
---

# Verify

**No completion claim without fresh evidence.** "Should pass", "looks correct" and "I fixed
it" are not evidence. Output from a command you ran after your last change is.

## Steps

1. Run the full validation in the task's worktree:
   ```bash
   baton verify
   ```
   It runs every command in `.baton/config.json` `validate`, in order, and stops at the
   first failure (exit code 1).
2. **On failure:** read the actual error and fix the cause, not the symptom. Don't weaken,
   skip or delete a test to get green. Don't add `#[allow]`, `eslint-disable`, `any` or
   `@ts-ignore` to silence a check, unless the stack guide permits it for that case and you
   explain why. Repeat until it passes. If the cause is unclear, use `baton:debug`.
3. **Check the acceptance criteria one by one** against the task (`baton show <n>`). For each
   one, name the test or the command output that proves it. A criterion with no proof is not
   met.
4. **Report** with the evidence: which commands ran, their pass/fail result, and the
   criteria -> proof mapping. If something was not verified (no test DB available, a UI not
   checked in a browser), say exactly that.

## Red flags. Stop and run the checks:

- You are about to say "done", "fixed", "all tests pass" or "ready for review".
- You changed code after the last test run.
- You are relying on the result of a run from before a rebase or merge.
- A subagent reported success. Verify it yourself, don't relay it.
