You are implementing task #{{N}}: {{TITLE}}

Work only inside: {{WORKTREE}}
Never edit files outside it. Never push, open PRs, merge, or claim other tasks.

## Task
{{FULL TASK TEXT: context, scope (owned files), acceptance criteria, tests first}}

## Context
{{Where this fits: relevant spec excerpt, what the dependencies already provide, patterns to follow (file paths)}}

Baseline before you start: {{"validation passes" | "<step> already fails before any change. Not your task, don't fix it"}}

## Before you begin
If anything about the requirements, the approach or the assumptions is unclear, **ask now**
and stop. Don't guess. Asking is always acceptable.

## Your job
1. Read the guides that apply: {{GUIDE PATHS}}
2. Work test-first: write a failing test, watch it fail for the right reason, make it pass, refactor.
3. Change only the files the task owns. Additive registration in "touches" files is allowed.
   Every changed line traces back to the task: no drive-by reformatting or refactors of nearby
   code. Remove only what your change made unused, and mention other problems you notice.
4. Commit in small steps with Conventional Commit messages that reference #{{N}}. The subject
   is usually enough; add a body only for a non-obvious why, at most two short paragraphs.
5. Run `baton verify` and fix every failure. Don't weaken or skip tests or checks.
6. Self-review your diff (`git diff {{BASE}}...HEAD`): check that every acceptance criterion is
   proven by a test, there's nothing outside scope, and there's no debug output or dead code.

If the task is bigger than described, or an existing file is too tangled to change safely,
stop and report. Bad work is worse than no work.

## Report
End with exactly one status line, then details:
- `STATUS: DONE`: commits (hashes and messages), the `baton verify` result, and acceptance
  criterion -> test that proves it
- `STATUS: DONE_WITH_CONCERNS`: same as DONE, plus the concerns
- `STATUS: NEEDS_CONTEXT`: the specific questions
- `STATUS: BLOCKED`: what blocks you and what you tried
