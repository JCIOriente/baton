---
name: implement
description: Use when starting or continuing work on a specific backlog task (given a task number, or inside a task worktree) in a baton repo.
argument-hint: "<task number>"
---

# Implement a task

## 1. Claim and isolate

```bash
baton start <n>      # race-safe claim + worktree + branch, runs `setup`, then a baseline validation
```

- If it says the task is claimed by someone else or has open dependencies, **stop** and
  report. Don't work around it. `--force` on dependencies only with the user's explicit OK.
- `cd` into the printed worktree path. From now on, **every edit happens in that directory.**
  The main checkout and other worktrees are off limits.
- `setup` commands from the config (e.g. `pnpm install`) already ran in the worktree.
  Worktrees don't share `node_modules`. Cargo's `target/` can be shared via `CARGO_TARGET_DIR`.
- **Read the baseline line.** If validation already failed before your change, that failure
  isn't yours. Report it, don't fix it silently, and don't let it hide new failures.

## 2. Load the context

1. `baton show <n>`: acceptance criteria, owned files, tests-first list, dependencies.
2. The linked spec and plan sections.
3. Stack guides for every stack this task touches (paths are in the `<baton>` block), plus the
   project conventions.
4. `docs/common-issues.md` if it exists (listed in the `<baton>` block): recurring bug
   patterns in this repo.
5. The existing code the task builds on. Follow its patterns.

If the task is ambiguous or contradicts the code, ask now. Guessing costs a review round later.

## 3. Test first (when `requireTdd` is on)

For each behavior in the acceptance criteria:

1. **Red:** write the test. Run it. Watch it fail **for the right reason**: missing behavior,
   not a typo or a missing import.
2. **Green:** write the minimum code that makes it pass. Run it.
3. **Refactor** with the tests green.
4. **Commit** with a Conventional Commit message that references the task:
   `feat(orgs): scope list to member org (#42)`. Use small, focused commits. Usually the
   subject is enough; a body, when the why needs one, is one or two short paragraphs.

Tests check behavior through public interfaces. Don't mock the thing you are testing. For
database code, test against a real Postgres (testcontainers or the project's test DB), not
mocks of the client.

Writing code before a test, then writing a test that passes immediately, does not count as TDD.
If you notice you did it, delete that code and redo the step properly.

## 4. Stay in bounds

- Only modify the files the task owns. Additive changes to "touches" files (registering a
  route, exporting a module) are fine. Restructuring them is not.
- Inside owned files too, every changed line traces back to the task: no drive-by
  reformatting, renames or refactors of nearby code. Remove only what your change made unused
  (see "Scope of a change" in the common guide).
- Found a bug or a missing piece outside the task? Create an issue (`baton:backlog`) and
  mention it. Don't fix it here.
- Task turns out much bigger than planned? Stop, explain, and propose a split.

## 5. Finish

When all acceptance criteria have passing tests, go to `baton:verify`. If you have to stop
before finishing, commit work in progress, push the branch, and leave a comment on the issue
saying where you are, so another session can continue. If you are abandoning the task:
`baton release <n> --reason "<why>"`.
