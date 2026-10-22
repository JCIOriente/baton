---
name: debug
description: Use when facing a bug, failing test, or unexpected behavior whose cause is not yet known. Finds the root cause before any fix is attempted.
---

# Debug

**No fix without a root cause.** Changing code to see if the symptom goes away is
guessing, and guesses pile up into new bugs.

## Phase 1: Investigate

1. Read the full error message and stack trace. Most of the answer is usually there.
2. Reproduce it reliably, as a failing test whenever possible. If you can't reproduce it,
   gather more data before going further.
3. Check what changed: `git log -p`, recent dependency bumps, config and environment.
4. Trace the bad value **backwards** through the call chain to where it first goes wrong.
   The place it crashes is rarely the place it broke.
5. In multi-component paths (UI -> API -> DB), log or inspect at each boundary to find
   which layer the data goes wrong in.

## Phase 2: Compare

Find similar code that works. List every difference between the working and broken paths,
however small. Read reference implementations fully. Skimming misses the difference.

## Phase 3: Hypothesize and test

State one hypothesis: "X is the cause because Y". Test it with the **smallest** change or
probe that could disprove it. One variable at a time. If it is disproved, form a new
hypothesis. Don't stack another change on top.

## Phase 4: Fix

1. Write a failing test that captures the bug.
2. Fix the root cause with one change.
3. Run the test and the full validation (`baton:verify`).

**Three failed fixes in a row means stop.** It is probably an architectural problem, not a
local one. Explain what you have learned and discuss it with the user before trying a fourth.

## Red flags

"Quick fix for now", "just try changing X", adding retries or sleeps to hide timing
problems, catching and ignoring errors, or fixing the symptom where it shows instead of where
it starts.
