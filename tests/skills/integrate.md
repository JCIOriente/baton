# Scenarios: integrate

Run each scenario as a fresh subagent that gets only `skills/integrate/SKILL.md` and the
scenario text. Ask it to write the exact `baton done` command it would run (title included),
the PR body's first paragraph, and any file it would edit, with reasons.

## PR title and changelog

### 1. A task that changes skill text (expect: feat or fix, not docs)

Task #31 rewrites `skills/review/SKILL.md` so agents run the spec-compliance gate before the
quality reviewers; today they run both at once. The only changed file is that markdown file.
Verification and review have passed. The issue title is "Order the review gates".

Expected: title type `feat` or `fix`, never `docs`.
Baseline (2026-10-29, skill at origin/main): `docs(review)`; it noted `feat`/`fix` could be argued.
After: `feat(review)`, citing the skill text rule.

### 2. A breaking change (expect: `!` and a BREAKING CHANGE line)

Task #32 renames the config key `workflow.requireTdd` to `workflow.tdd`. Existing
`.baton/config.json` files that use the old key stop working until users rename it. Verified
and reviewed. The repo squashes with the PR title and body.

Expected: `!` in the title; a `BREAKING CHANGE: <what users must change>` line in the PR body.
Baseline (2026-10-29): `feat(config)!`, but no `BREAKING CHANGE:` line in the body.
After: `feat(config)!` and the body starts with `BREAKING CHANGE: ...`.

### 3. Releases enabled (expect: user-facing title, `--title` passed, no changelog edit)

Session context says: "Releases: on demand with baton:release. Never edit CHANGELOG.md or
version files in a task PR; the PR title is the changelog entry." Task #33 (issue title
"release: wire up ci") makes `baton doctor` list stacks that are detected but not enabled, which
it did not do before. The repo has a `CHANGELOG.md` and a `package.json` version. Verified and
reviewed.

Expected: `--title` is passed with a Conventional Commit written for users (not the issue
title); `CHANGELOG.md` and the version are not edited.
title); `CHANGELOG.md` and the version are not edited.

Baseline (2026-10-29): already correct (`feat(doctor)`, no file edits). The guard is the `--title` sentence.
After: same, and it said it must pass `--title` because the issue title is not a Conventional Commit.

### 4. Releases off, hand-written changelog (expect: no changelog instruction)

The session context has no release line. The repo's `CHANGELOG.md` has a hand-written
`## Unreleased` section, and its CONTRIBUTING says each PR adds a line there. Task #34 fixes a
crash in `baton claim` and the agent already added its line under `## Unreleased`. Verified and
reviewed.

Expected: the skill gives no instruction about the changelog, so the agent keeps the line and
follows the repo's own convention. It does not revert it.
follows the repo's own convention. It does not revert it.

Baseline (2026-10-29): kept the line, no changelog instruction.
After: kept the line; it noted the ban applies only when the context shows releases enabled.
