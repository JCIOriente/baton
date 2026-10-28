# Release phase — Implementation Plan

- Spec: [docs/specs/2026-10-28-release-phase.md](../specs/2026-10-28-release-phase.md)
- Date: 2026-10-28
- Status: draft

## Overview
Five tasks, cut by file ownership. T1 to T4 can run in parallel. T5 is the migration of baton
itself: it reuses T2's templates, so it starts after T2 merges.

- T1: the CLI part (the `release` phase and the `baton done` guard)
- T2: release templates and the `baton:init` step
- T3: the `baton:release` skill
- T4: PR-title rules in the integrate skill and the docs
- T5: baton adopts release-please

From this plan on, no task edits `CHANGELOG.md` except T5, which removes the hand-written
`## Unreleased` section. The generated notes cover all of it.

## Contract
The files `baton:init` writes (`release.yml`, `release-please-config.json`,
`.release-please-manifest.json`) are owned by T2 in `templates/release/`. T5 copies them for
baton. No API changes.

## Impact
- **Affected call paths and consumers:** `baton done` (`cli/baton.mjs` `done()`) gains a refusal.
  `BUILTIN_PHASES` and the default `workflow.phases` (`cli/lib/config.mjs:9,65`) gain `release`,
  which shows up in the session context line (`cli/lib/context.mjs:39`) of every adopting repo.
  Existing configs that list phases explicitly keep working: `release` is only added to the
  defaults.
- **Data and migrations:** none in code. Repos opt in through `baton:init`.
- **Tests that must stay green:** `cli/test/tasks.test.mjs` (config validation, custom phases)
  and `cli/test/features.test.mjs` (`reviewState`, context).
- **Rollout and rollback:** the guard only triggers when `release-please-config.json` exists, so
  repos that haven't opted in see no change. To roll back, revert T1. Repos can delete their
  release config to turn the guard off.

## Dependency graph
```
T1 (independent)
T2 ──> T5
T3 (independent)
T4 (independent)
```
Can start immediately in parallel: T1, T2, T3, T4

## Tasks

### T1: `release` phase and the CHANGELOG guard in `baton done`
- Priority: 1
- Depends on: none
- Owns: `cli/lib/config.mjs`, `cli/baton.mjs` (only `done()` and `branchDiff`), `cli/lib/tasks.mjs`
  (a new pure helper), `cli/test/tasks.test.mjs`, `cli/test/features.test.mjs`,
  `templates/config.example.json`
- Touches (read-only or additive): `cli/lib/context.mjs`
- Acceptance:
  - [ ] `release` is in `BUILTIN_PHASES` and is the last default phase. A config that lists
    `release` validates without a `workflow.custom` entry.
  - [ ] With `release-please-config.json` at the repo root and `CHANGELOG.md` in the diff
    against the base branch, `baton done` exits non-zero before pushing, with "CHANGELOG.md is
    generated at release. Revert it; the PR title is the changelog entry."
  - [ ] Without that file, the same diff is allowed.
  - [ ] `--draft` and `--skip-review` don't bypass the guard.
  - [ ] `make ci` passes.
- Tests first: `changelogGuard_blocks_changelog_edit_when_release_configured`,
  `changelogGuard_allows_when_release_not_configured`, `validateConfig_accepts_release_phase`
- Notes: put the decision in a pure function in `tasks.mjs`, such as
  `changelogGuard({ files, releaseConfigured })`, next to `reviewState`, and test it there.
  `done()` gets the changed files from the existing `branchDiff` and calls it before
  validation. Don't edit `CHANGELOG.md`.

### T2: release templates and the `baton:init` step
- Priority: 1
- Depends on: none
- Owns: `templates/release/**`, `skills/init/SKILL.md`, `cli/test/release-templates.test.mjs` (new)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `templates/release/release.yml` runs `googleapis/release-please-action` on push to the
    base branch with `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`, and pins the action to a
    released major version.
  - [ ] `templates/release/release-please-config.json` has one package at `.`,
    `bump-minor-pre-major: true` and an `extra-files` slot. The init step says to use
    `release-type: node` with a root `package.json` and `simple` otherwise.
  - [ ] `templates/release/.release-please-manifest.json` holds `{ ".": "<version>" }`.
  - [ ] `baton:init` has a release step after the squash-message step. It is offered only when
    `git.mergeStrategy` is `squash`, runs only after the user confirms, reads the current
    version from the existing version file (or uses `0.0.0`), and lists the token steps: a
    fine-grained PAT for this repo with Contents, Pull requests and Issues set to read and
    write, saved as the `RELEASE_PLEASE_TOKEN` secret.
  - [ ] A test parses both JSON templates and checks that the workflow references
    `RELEASE_PLEASE_TOKEN`. `make ci` passes.
- Tests first: `release_templates_are_valid_json`, `release_workflow_uses_release_please_token`
- Notes: check the current release-please-action major version and the config keys against
  its README before writing them. Don't edit `CHANGELOG.md`.

### T3: the `baton:release` skill
- Priority: 1
- Depends on: none
- Owns: `skills/release/SKILL.md` (new), `skills/workflow/SKILL.md`, `tests/skills/release.md` (new),
  `evals/release-cut/**` (new)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] The skill follows the spec's five steps: find the release PR, show the version and
    notes, fix bad entries through a `BEGIN_COMMIT_OVERRIDE` block on the source PR, merge only
    when the user says so, and confirm the tag and the Release.
  - [ ] It covers the edge cases: no release PR (nothing releasable, or a failed release run;
    point at `gh run list --workflow release.yml`), a commit with the wrong type, and
    `Release-As`.
  - [ ] The workflow skill's phase table has a `release` row marked on demand, and says
    "cut a release" routes to `baton:release`.
  - [ ] `tests/skills/release.md` has a red/green scenario run with fresh subagents: a release
    PR with a badly worded entry. The agent must propose an override instead of editing
    `CHANGELOG.md`, and must not merge unprompted.
  - [ ] `evals/release-cut/` has a trigger case modelled on `evals/integrate-ready/`.
    `make ci` passes.
- Tests first: the red scenario in `tests/skills/release.md`, run without the skill.
- Notes: follow `.claude/skills/writing-skills/SKILL.md`. Don't edit `CHANGELOG.md`.

### T4: PR-title rules in integrate and the docs
- Priority: 2
- Depends on: none
- Owns: `skills/integrate/SKILL.md`, `CONTRIBUTING.md`, `README.md`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `baton:integrate` says the PR title is the changelog entry, written for users. It says
    to pick `feat`/`fix` by effect, that skill or guide text that changes agent behavior is
    `feat` or `fix` and not `docs`, and that a breaking change needs `!` in the title and
    `BREAKING CHANGE:` in the PR body.
  - [ ] `baton:integrate` and CONTRIBUTING say never to edit `CHANGELOG.md` or version files
    in a task PR.
  - [ ] The README phase line includes `release`, and the README explains how versions and
    tags are produced (one short paragraph, linking the spec).
  - [ ] `make ci` passes.
- Tests first: none (prose). The reviewer checks the wording against the spec's Interfaces
  section.
- Notes: keep each addition to a sentence or two. Don't edit `CHANGELOG.md`.

### T5: baton adopts release-please
- Priority: 2
- Depends on: T2
- Owns: `release-please-config.json` (new), `.release-please-manifest.json` (new),
  `.github/workflows/release.yml` (new), `CHANGELOG.md`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] The config uses `release-type: node`, `bump-minor-pre-major: true` and `extra-files`
    for `.claude-plugin/plugin.json` (`$.version`). The manifest is `{ ".": "0.1.0" }`.
  - [ ] `CHANGELOG.md` has no `## Unreleased` section. Its header says the file is generated
    from PR titles at release, and the hand-written `0.1.0` section stays.
  - [ ] The PR description tells the maintainer to add the `RELEASE_PLEASE_TOKEN` secret
    before merging.
  - [ ] After the merge, a release PR for 0.2.0 opens and the `ci` check runs on it. Record
    this on the task.
  - [ ] `make ci` passes.
- Tests first: none (configuration). The live check is the release PR opening with CI.
- Notes: copy the T2 templates; don't write new ones. Don't merge the release PR. Cutting
  0.2.0 is a separate `baton:release` run when the maintainer asks for it.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| PRs don't edit CHANGELOG; `baton done` refuses | T1 (guard), T4 (rule) |
| Release PR, tag and Release from release-please | T2 (templates), T5 (baton) |
| CI runs on the release PR (PAT) | T2 (workflow token, init steps), T5 (live check) |
| `release` built-in phase, on demand | T1 (config), T3 (workflow table) |
| `baton:release` skill and edge cases | T3 |
| `baton:init` sets it up for adopting repos | T2 |
| PR title is the entry; feat/fix by effect; breaking changes | T4 |
| baton migrates: manifest 0.1.0, plugin.json bumped, Unreleased removed | T5 |
| Testing: unit, templates, skill scenario, live | T1, T2, T3, T5 |
