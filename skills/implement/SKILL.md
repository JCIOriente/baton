---
name: implement
description: Use to implement one backlog task in a baton repo. Claims the task, creates its isolated worktree, and executes it test-first within the task's file boundaries.
argument-hint: "<task number>"
---

# Implement a task

## 1. Claim and isolate

```bash
baton start <n>      # race-safe claim + worktree + branch; prints the worktree path
```

- If it says the task is claimed by someone else or has open dependencies, **stop** and
  report. Don't work around it. `--force` on dependencies only with the user's explicit OK.
- `cd` into the printed worktree path. From now on, **every edit happens in that directory.**
  The main checkout and other worktrees are off limits.
- Install dependencies in the worktree if the project needs it (e.g. `pnpm install`).
  Worktrees don't share `node_modules`. Cargo's `target/` can be shared via `CARGO_TARGET_DIR`
  if the project configured it.

## 2. Load the context

1. `baton show <n>`: acceptance criteria, owned files, tests-first list, dependencies.
2. The linked spec and plan sections.
3. Stack guides for every stack this task touches (paths are in the `<baton>` block), plus the
   project conventions.
4. The existing code the task builds on. Follow its patterns.

If the task is ambiguous or contradicts the code, ask now. Guessing costs a review round later.

## 3. Test first (when `requireTdd` is on)

For each behavior in the acceptance criteria:

1. **Red:** write the test. Run it. Watch it fail **for the right reason**: missing behavior,
   not a typo or a missing import.
2. **Green:** write the minimum code that makes it pass. Run it.
3. **Refactor** with the tests green.
4. **Commit** with a message that references the task: `feat(orgs): scope list to member org (#42)`.

Tests check behavior through public interfaces. Don't mock the thing you are testing. For
database code, test against a real Postgres (testcontainers or the project's test DB), not
mocks of the client.

Writing code before a test, then writing a test that passes immediately, does not count as TDD.
If you notice you did it, delete that code and redo the step properly.

## 4. Stay in bounds

- Only modify the files the task owns. Additive changes to "touches" files (registering a
  route, exporting a module) are fine. Restructuring them is not.
- Found a bug or a missing piece outside the task? Create an issue (`baton:backlog`) and
  mention it. Don't fix it here.
- Task turns out much bigger than planned? Stop, explain, and propose a split.

## 5. Finish

When all acceptance criteria have passing tests, go to `baton:verify`. If you have to stop
before finishing, commit work in progress, push the branch, and leave a comment on the issue
saying where you are, so another session can continue. If you are abandoning the task:
`baton release <n> --reason "<why>"`.
