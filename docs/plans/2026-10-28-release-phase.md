# Release phase — Implementation Plan

- Spec: [docs/specs/2026-10-28-release-phase.md](../specs/2026-10-28-release-phase.md)
- Date: 2026-10-28
- Status: approved

## Overview
Six tasks, cut by file ownership. T1 to T4 can run in parallel. T5 is the migration of baton
itself: it uses T1's config key and T2's templates, so it starts after both merge. T6 adds
registry publishing to T2's workflow template and init step, so it starts after T2 merges.

- T1: the CLI part (the `release` config, the `baton done` guard, context, init, doctor)
- T2: release templates and the `baton:init` release step
- T3: the `baton:release` skill
- T4: PR-title rules in the integrate skill and the docs
- T5: baton enables releases for itself
- T6: publishing to npm and crates.io from the tag

From this plan on, no task edits `CHANGELOG.md` except T5, which removes the hand-written
`## Unreleased` section after adding commit overrides for the entries no `feat` or `fix` commit
covers.

## Contract
- Config: `release: { enabled: boolean, publish: ("npm" | "crates")[] }`, defaults `false` and
  `[]`, owned by T1. T2, T3, T4 and T6 refer to it by these names; T5 sets `enabled: true` for
  baton.
- Session context line when enabled, owned by T1: "Releases: on demand with baton:release. Never
  edit CHANGELOG.md or version files in a task PR; the PR title is the changelog entry." T3 and
  T4 tell agents to look for it.
- The files `baton:init` writes (`release.yml`, `release-please-config.json`,
  `.release-please-manifest.json`) live in `templates/release/`, owned by T2. T6 adds the publish
  jobs to `release.yml`. T5 copies the T2 templates.
- Tag format: `v<version>`, set by `include-component-in-tag: false` and `include-v-in-tag: true`
  in `release-please-config.json` (T2). `baton doctor` checks it (T1).
- Workflow names: the file is `.github/workflows/release.yml`; jobs are `release-please`,
  `publish-npm` and `publish-crates`; the `release-please` job outputs `release_created`,
  `tag_name` and `version`; publish jobs run in the environment `release`. T1's doctor check
  and T3's skill rely on these names.

## Impact
- **Affected call paths and consumers:** `loadConfig` gains defaults and validation rules.
  `baton done` (`cli/baton.mjs` `done()`) gains a refusal that reads the base branch's config,
  `baton init` writes the new key, and `baton doctor` gains the release checks. The session
  context (`cli/lib/context.mjs`) gains one line, only when enabled. `BUILTIN_PHASES` and
  `workflow.phases` don't change.
- **Data and migrations:** none in code. Existing configs have no `release` key and merge to
  `enabled: false`, `publish: []`. Repos opt in through `baton:init`.
- **Tests that must stay green:** `cli/test/tasks.test.mjs` (config validation, custom phases)
  and `cli/test/features.test.mjs` (`reviewState`, context).
- **Rollout and rollback:** everything is gated on `release.enabled`, so repos that haven't opted
  in see no change. To roll back, revert T1. A repo turns the feature off by setting the key to
  `false`. Publishing only runs in repos that list a target and set up trusted publishing.

## Dependency graph
```
T1 ──> T5
T2 ──> T5
T2 ──> T6
T3 (independent)
T4 (independent)
```
Can start immediately in parallel: T1, T2, T3, T4

## Tasks

### T1: the `release` config and the CHANGELOG guard (#20)
- Priority: 1
- Depends on: none
- Owns: `cli/lib/config.mjs`, `cli/lib/context.mjs`, `cli/baton.mjs` (only `done()`, `init()`
  and `doctor()`), `cli/lib/tasks.mjs` (new pure helpers), `cli/test/tasks.test.mjs`,
  `cli/test/features.test.mjs`, `templates/config.example.json`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `DEFAULT_CONFIG.release` is `{ enabled: false, publish: [] }`, with a one-line comment
    like the other opt-ins. A config without the key loads with those values.
  - [ ] `validateConfig` rejects `release.enabled: true` with a non-squash merge strategy, a
        non-empty `publish` with `enabled: false`, an unknown `publish` entry, a non-boolean
        `enabled` and a non-array `publish`, using the spec's messages where it gives one.
  - [ ] With `release.enabled: true` in the base branch's `.baton/config.json` and
    `CHANGELOG.md` in the diff against the base branch, `baton done` exits non-zero before
    pushing, with "CHANGELOG.md is generated at release. Revert it; the PR title is the
    changelog entry." `--draft` and `--skip-review` don't bypass it.
  - [ ] When the base branch has it false or has no config, the same diff is allowed, including
    when the worktree's config turns it on.
  - [ ] The session context has the release line from the Contract only when enabled.
  - [ ] `baton init` writes `"release": { "enabled": false, "publish": [] }`.
    `templates/config.example.json` shows the key.
  - [ ] `baton doctor` reports every mismatch the spec lists: enabled with a release file
        missing; disabled with any release file present; the config not setting
        `include-component-in-tag: false` and `include-v-in-tag: true`; `npm` with a private or
        missing root `package.json`; `crates` with a missing root `Cargo.toml` or `publish =
        false`; a publish target with no `publish-<target>` job in `release.yml`.
  - [ ] `make ci` passes.
- Tests first: `changelogGuard_blocks_changelog_edit_when_release_enabled`,
  `changelogGuard_allows_when_release_disabled`, `validateConfig_rejects_release_without_squash`,
  `validateConfig_rejects_publish_without_release`, `validateConfig_rejects_unknown_publish_target`,
  `defaultConfig_release_disabled`, `context_mentions_release_only_when_enabled`,
  `releaseFindings_reports_each_mismatch`
- Notes: put the decisions in pure functions in `tasks.mjs`, such as
  `changelogGuard({ files, releaseEnabled })` next to `reviewState`, and
  `releaseFindings({ config, files })` that takes the file contents it needs, and test them
  there. `done()` gets the changed files from the existing `branchDiff`, reads the base config
  from the same ref `branchDiff` resolved (`git show <ref>:.baton/config.json`; missing or
  invalid means off), and calls the
  guard before validation. Don't edit `CHANGELOG.md`.

### T2: release templates and the `baton:init` release step (#21)
- Priority: 1
- Depends on: none
- Owns: `templates/release/**`, `skills/init/SKILL.md`, `cli/test/release-templates.test.mjs` (new),
  `provenance.json` (the release actions only)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `templates/release/release.yml` has the `release-please` job: it runs
    `googleapis/release-please-action` on push to the base branch and on `workflow_dispatch`, with
    `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`, exposes `release_created`, `tag_name` and
    `version` as job outputs, and pins every `uses:` to a full commit SHA with the released
    version in a comment. Top-level `permissions: {}`; each job declares its own. It sets
    `concurrency: { group: release, cancel-in-progress: false }`.
  - [ ] `templates/release/release-please-config.json` has one package at `.`,
    `bump-minor-pre-major: true`, `include-component-in-tag: false`, `include-v-in-tag: true`
    and an `extra-files` slot. The init step says to use `release-type: node` with a root
    `package.json`, `rust` with a root `Cargo.toml`, and `simple` otherwise
    (`simple` keeps the version in `version.txt`). Init sets `last-release-sha`
    when the latest existing tag isn't `v<version>`.
  - [ ] `templates/release/.release-please-manifest.json` holds `{ ".": "<version>" }`.
  - [ ] There is no CHANGELOG template.
  - [ ] `baton:init` has a release step after the squash-message step. It is offered only when
    `git.mergeStrategy` is `squash`, explains the trade-off, and defaults to no. On no, it leaves
    `release.enabled: false` and writes nothing. On yes, it sets `release.enabled: true`, reads
    the current version from the existing version file (or uses `0.0.0`), writes the three
    files, checks each `## Unreleased` entry against the commits since the last tag and proposes
    a `BEGIN_COMMIT_OVERRIDE` for any entry no `feat` or `fix` commit covers, then removes the
    section, and lists the token steps: a
    fine-grained PAT for this repo with Contents, Pull requests and Issues set to read and
    write, saved as the `RELEASE_PLEASE_TOKEN` secret.
  - [ ] The step also suggests, and runs only after the user confirms, a tag ruleset blocking
    updates and deletion of `v*` tags and turning on immutable releases.
  - [ ] The release step runs on its own in a repo that already has `.baton/config.json`,
    without `baton init`, rewriting the three files from the templates and the current config,
    and ends by re-running `baton doctor`.
  - [ ] Step 3's config walkthrough lists `release.enabled` as opt-in, pointing at that step.
  - [ ] A test parses both JSON templates, checks the two tag settings, checks that the workflow
    references `RELEASE_PLEASE_TOKEN` and exposes the three outputs, and checks that every
    `uses:` is pinned to a 40-character SHA. `make ci` passes.
- Tests first: `release_templates_are_valid_json`, `release_config_tags_are_v_version`,
  `release_workflow_uses_release_please_token`, `release_workflow_pins_actions_to_sha`
- Notes: check the current release-please-action version, its output names and the config keys
  against its README before writing them. Leave a clearly marked place in `release.yml` for
  T6's publish jobs. Confirm that the GitHub Release is named `v<version>` with
  `include-component-in-tag: false`, and that release-please keeps the existing CHANGELOG header
  and `0.1.0` section. Add the pinned actions to `provenance.json` so the weekly drift check flags
  new versions. Don't edit `CHANGELOG.md`.

### T3: the `baton:release` skill (#22)
- Priority: 1
- Depends on: none
- Owns: `skills/release/SKILL.md` (new), `skills/workflow/SKILL.md`, `tests/skills/release.md`
  (new), `evals/release-cut/**` (new)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] The skill first checks that releases are enabled (the session context line or
    `release.enabled` in `baton config`). If not, it says so, points at the `baton:init` release
    step, and stops without setting anything up.
  - [ ] It then follows the spec's five steps: find the release PR; show the version, the tag
        `v<version>` and the notes; fix bad entries through a `BEGIN_COMMIT_OVERRIDE` block on
        the source PR, then re-run the workflow with `gh workflow run release.yml`; merge only
        when the user says so; confirm the tag, the Release and, for each `release.publish`
        target, the publish job and the registry version.
  - [ ] It covers the edge cases: no release PR (nothing releasable, or a failed release run;
    point at `gh run list --workflow release.yml`), a commit with the wrong type, `Release-As`,
    and a failed publish job (offer `gh run rerun --failed`; never publish locally, re-tag or
    bump the version).
  - [ ] The skill says it is not `baton release <n>`, which gives a task back, and never runs
    that command.
  - [ ] The workflow skill lists `baton:release` as on demand, outside the per-task phases, and
    routes "cut a release" to it in every repo; the skill stops at step 0 when releases are off.
  - [ ] `tests/skills/release.md` has red/green scenarios run with fresh subagents: a release
    PR with a badly worded entry (propose an override instead of editing `CHANGELOG.md`; don't
    merge unprompted), a repo with releases disabled (don't set up release-please), and a publish
    job that failed after the tag was created (re-run the job; don't publish locally or re-tag).
  - [ ] `evals/release-cut/` has a trigger case modelled on `evals/integrate-ready/`. Its scaffold
    sets `release.enabled: true`, or the skill correctly stops at step 0. `make ci` passes.
- Tests first: the red scenarios in `tests/skills/release.md`, run without the skill.
- Notes: follow `.claude/skills/writing-skills/SKILL.md`. Use the workflow and job names from
  the Contract. Don't edit `CHANGELOG.md`.

### T4: PR-title rules in integrate and the docs (#23)
- Priority: 2
- Depends on: none
- Owns: `skills/integrate/SKILL.md`, `CONTRIBUTING.md`, `README.md`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `baton:integrate` says, in every repo, to pick `feat`/`fix` by effect, that skill or
    guide text that changes agent behavior is `feat` or `fix` and not `docs`, and that a
    breaking change needs `!` in the title and `BREAKING CHANGE:` in the PR body.
  - [ ] `baton:integrate` says that when the session context shows releases enabled, the PR
    title is the changelog entry, written for users, and a task PR never edits `CHANGELOG.md` or
    version files, publishes a package or creates a tag. It says nothing about a changelog
    otherwise.
  - [ ] CONTRIBUTING says `CHANGELOG.md` is generated at release, and baton's own PRs never edit
    it or version files.
  - [ ] The README says releases and publishing are opt-in through `release.enabled`,
    `release.publish` and `baton:init`, and explains in one short paragraph how versions, `v`
    tags and published packages are produced, linking the spec.
  - [ ] `make ci` passes.
- Tests first: none (prose). The reviewer checks the wording against the spec's Interfaces
  section.
- Notes: keep each addition to a sentence or two. Don't edit `CHANGELOG.md`.

### T5: baton enables releases for itself (#24)
- Priority: 2
- Depends on: T1, T2
- Owns: `.baton/config.json`, `release-please-config.json` (new),
  `.release-please-manifest.json` (new), `.github/workflows/release.yml` (new), `CHANGELOG.md`
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `.baton/config.json` has `"release": { "enabled": true, "publish": [] }`, and
    `baton doctor` reports no release mismatch.
  - [ ] The config uses `release-type: node`, `bump-minor-pre-major: true`,
    `include-component-in-tag: false`, `include-v-in-tag: true` and `extra-files` for
    `.claude-plugin/plugin.json` (`$.version`). The manifest is `{ ".": "0.1.0" }`.
  - [ ] `release.yml` is the T2 template with no publish jobs (baton's `package.json` is
    private).
  - [ ] Each `## Unreleased` entry maps to a `feat` or `fix` commit since `v0.1.0`. #2, #3 and
    #18 get a `BEGIN_COMMIT_OVERRIDE` block on their PR with the right type before the section is
    removed.
  - [ ] `CHANGELOG.md` has no `## Unreleased` section. Its header says the file is generated
    from PR titles at release, and the hand-written `0.1.0` section stays.
  - [ ] The PR description tells the maintainer to add the `RELEASE_PLEASE_TOKEN` secret
    before merging.
  - [ ] After the merge, a release PR for 0.2.0 opens and the `ci` check runs on it. Record
    this on the task.
  - [ ] `make ci` passes.
- Tests first: none (configuration). The live check is the release PR opening with CI.
- Notes: copy the T2 templates; don't write new ones. The guard reads `main`'s config, where the
  key is still off, so this PR's CHANGELOG edit passes `baton done`. Don't merge the release PR.
  Cutting 0.2.0 is a separate `baton:release` run when the maintainer asks for it; it must
  produce the tag and Release `v0.2.0`.

### T6: publishing to npm and crates.io from the tag (#25)
- Priority: 2
- Depends on: T2
- Owns: `templates/release/release.yml` (the publish jobs only), `skills/init/SKILL.md` (the
  publish part of the release step), `cli/test/release-templates.test.mjs` (publish cases),
  `provenance.json` (the publish actions)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `release.yml` has `publish-npm` and `publish-crates` jobs, each marked for init to keep
    only when that target is in `release.publish`. Each has `needs: release-please`,
    `if: needs.release-please.outputs.release_created == 'true'`, `environment: release`, and
    `permissions: { contents: read, id-token: write }`; no other job has `id-token: write`.
  - [ ] Each publish job checks out `tag_name`, fails before publishing unless the version in
        `package.json` or `Cargo.toml` equals `version` and `tag_name` equals `v<version>`, and
        skips with success if that version is already on the registry (`npm view
        <name>@<version>`, the crates.io API). `npm view` exits 0 with empty output for a
        missing version, so the job tests the output; the crates.io API needs a `User-Agent`
        header.
  - [ ] npm publishes with trusted publishing (no `NPM_TOKEN`); crates publishes with
    `rust-lang/crates-io-auth-action` and `cargo publish` (no stored `CARGO_REGISTRY_TOKEN`).
    Every `uses:` is pinned to a SHA.
  - [ ] The `baton:init` release step asks whether to publish, offering only targets the repo
    can publish (`npm` for a root `package.json` without `"private": true`, `crates` for a root
    `Cargo.toml` without `publish = false`), default none; records the answer in
    `release.publish`; keeps only those jobs; lists the trusted-publisher setup on each registry
    (this repo, `release.yml`, environment `release` limited to the base branch); says that a
    package not yet on the registry needs its current version published once by hand from its
    tag before the trusted publisher can be added; says to revoke old registry tokens after the
    first CI publish; and suggests a publish dry run in the repo's CI script.
  - [ ] The template test checks the gating, the checkout ref, the version-equals-tag step, the
    `id-token` scoping and the SHA pins for both publish jobs. `make ci` passes.
- Tests first: `publish_jobs_need_release_created`, `publish_jobs_check_out_the_tag`,
  `publish_jobs_check_version_matches_tag`, `id_token_only_on_publish_jobs`
- Notes: check the current npm trusted-publishing requirements (npm CLI 11.5.1 or later and Node
  22.14.0 or later at the time of writing; provenance only for public repos and packages) and
  `rust-lang/crates-io-auth-action` against their docs before writing the jobs. Live
  verification happens in the first adopting repo that enables publishing; baton doesn't
  publish. Don't edit `CHANGELOG.md`.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| One opt-in key, off by default; nothing changes when off | T1 (config, guard, context, init, doctor), T2 (init step), T3 (skill check), T4 (conditional rule) |
| PRs don't edit CHANGELOG when enabled; `baton done` refuses | T1 (guard), T4 (rule) |
| The enabling PR may remove `## Unreleased` | T1 (guard reads base branch), T5 |
| Release PR, tag and Release from release-please | T2 (templates), T5 (baton) |
| Tags and Releases are `v<version>`, no package name | T2 (config), T1 (doctor), T5 (live) |
| CI runs on the release PR (PAT) | T2 (workflow token, init steps), T5 (live check) |
| Tags can't be moved or deleted; immutable releases | T2 (init suggestion) |
| Publish to npm / crates.io from the tag, version equals tag, trusted publishing | T6 (jobs, init), T1 (config, doctor) |
| Failed publish is re-run, never re-tagged | T6 (idempotent jobs), T3 (skill) |
| `baton:release` on demand, routed from the workflow skill | T3 |
| `baton:init` sets it up for adopting repos (node, rust, simple) | T2, T6 |
| PR title is the entry; feat/fix by effect; breaking changes; no hand publish | T4 |
| baton migrates: key on, manifest 0.1.0, plugin.json bumped, Unreleased removed | T5 |
| First version of a new package published by hand from its tag; CI after | T6 (init) |
| `## Unreleased` entries kept through commit overrides | T2 (init), T5 |
| `last-release-sha` for tags in another format | T2 |
| `baton:release` is not `baton release <n>` | T3, CONTEXT.md |
| Testing: unit, templates, skill scenarios, live | T1, T2, T3, T5, T6 |
