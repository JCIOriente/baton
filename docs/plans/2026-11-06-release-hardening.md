# Release hardening — Implementation Plan

- Spec: [docs/specs/2026-11-06-release-hardening.md](../specs/2026-11-06-release-hardening.md)
- Date: 2026-11-06
- Status: done

## Overview
Four tasks along file boundaries. T1 rewrites the release workflow template (one `publish` job,
dry run). T3 (release skill) and T4 (doctor check) build against the contract below and run in
parallel with T1. T2 (init skill) depends on T1, because it edits the template by its markers, and on T4 for its cross-check test.

## Contract
T1 owns the workflow shape; T2, T3 and T4 build against it:
- `on.workflow_dispatch.inputs.dry_run` (boolean, default false). Dispatch:
  `gh workflow run release.yml -f dry_run=true`.
- Jobs: `release-please`, `build-npm`, `verify-crates`, `dry-run-npm`, `publish`. No
  `publish-npm` or `publish-crates` job.
- `publish` has `environment: publish`; its steps carry `name: Publish to npm` and
  `name: Publish to crates.io`.
- Per-target markers for `baton:init`, one line above each job or step block:
  `# baton:init: keep this <job|step> only when release.publish has "npm"` (or `"crates"`).
  Every step in `publish` is target-specific and marked (npm: setup-node, npm version check,
  download-artifact, tarball check, registry skip, publish; crates: checkout, version check,
  registry skip, auth, publish). A `publish` job with no target steps left is deleted by init.
- `publish` has `needs: [release-please, build-npm, verify-crates]` on one line; init removes
  the name of each job it deletes. `publish`'s `if:` names no build or verify job and uses no
  status function, so the implicit `success()` requires every need to have succeeded.
- `release-please` is skipped on a dry run, and GitHub skips every job downstream of a skipped
  job unless its `if:` uses a status function. So `build-npm` and `verify-crates` use
  `if: ${{ !cancelled() && (needs.release-please.outputs.release_created == 'true' || inputs.dry_run) }}`,
  and `dry-run-npm` uses `if: ${{ !cancelled() && inputs.dry_run && needs.build-npm.result == 'success' }}`.

## Impact
- Affected consumers: repos that adopted the release template with publishing. They keep
  working on the old layout until they re-run the init release step; then their trusted
  publishers must name environment `publish`. `baton doctor` reports the old layout (T4).
- baton itself: `publish: []`, so its `.github/workflows/release.yml` gains only the `dry_run`
  input and the skip on `release-please` (T1).
- Tests that must stay green: `cli/test/release-templates.test.mjs` (rewritten where it asserts
  the old job names), `cli/test/features.test.mjs` releaseFindings test (T4), actionlint.
- Rollout: template and skills ship in the next baton release. Rollback: revert the PRs;
  adopters who migrated switch their trusted publishers back to `release`.

## Dependency graph
```
T1 ──> T2
T4 ──> T2
T3 (independent)
```
Can start immediately in parallel: T1, T3, T4

## Tasks

### T1: One approved `publish` job and a dry run in the release workflow template  (#60)
- Priority: 1
- Depends on: none
- Owns: `templates/release/release.yml`, `.github/workflows/release.yml`,
  `cli/test/release-templates.test.mjs`
- Acceptance:
  - [ ] `workflow_dispatch` has input `dry_run` (boolean, default false); `release-please` is
        skipped when it is true. baton's own `.github/workflows/release.yml` gets the same input
        and skip, and still matches the template's release-please job.
  - [ ] `build-npm` and `verify-crates` run when a release was created or on a dry run. On a dry
        run they check out the dispatched commit and compare the package version with the
        manifest (`.release-please-manifest.json` `"."`); otherwise unchanged.
        On a dry run `verify-crates` runs `cargo publish --dry-run` instead of `cargo package`
        (not both, to avoid compiling twice), with `--locked` when `Cargo.lock` is tracked.
  - [ ] `dry-run-npm` runs only on a dry run, with `permissions: { contents: read }`, no
        environment, no id-token; it runs the same tarball checks as `publish`, then
        `npm publish <file>.tgz --dry-run --ignore-scripts`.
  - [ ] A single `publish` job replaces `publish-npm` and `publish-crates`: `needs` every build
        and verify job, runs only when a release was created and they all succeeded (never on a
        dry run), `permissions: { contents: read, id-token: write }`, `environment: publish`.
        All check steps come before any publish step; `Publish to npm` comes before
        `Publish to crates.io`. Registry skip checks, the npm version check, `--ignore-scripts`
        and `--no-verify` are kept.
  - [ ] Markers follow the Contract. No `${{ }}` inside any `run:` script. Every `uses:` is
        pinned to a SHA. `publish` is the only job with `id-token: write` and the only one in
        environment `publish`; `release-please` is the only one in `release`.
  - [ ] The `if:` conditions follow the Contract: dry-run-path jobs use `!cancelled()`,
        `publish` uses no status function.
  - [ ] For each target alone, deleting the other target's marked blocks and trimming `needs`
        leaves a workflow that passes actionlint.
  - [ ] The PR records, from a manual check, what `npm publish <tgz> --dry-run` and
        `cargo publish --dry-run` do for a version the registry already has.
  - [ ] actionlint passes; `make ci` passes.
- Tests first: `dry_run_input_defaults_false_and_skips_release_please`,
  `single_publish_job_needs_every_build_and_verify_job`,
  `publish_checks_everything_before_publishing_anything`, `npm_publishes_before_crates`,
  `dry_run_jobs_have_no_id_token_or_environment`, `verify_crates_dry_run_publish_only_on_dry_run`,
  `dry_run_path_ifs_use_not_cancelled`, `publish_if_has_no_status_function`,
  `each_single_target_trim_passes_actionlint`.
  Update the existing tests that name `publish-npm`/`publish-crates`.
- Notes: keep the existing tarball validation and registry-skip shell code; move it, don't
  rewrite it. Spec "Interfaces" has the full job list. Deviation from the spec, agreed in plan
  review: the crates dry run replaces `cargo package` rather than adding to it, and `--locked`
  applies only when `Cargo.lock` is tracked. A live dry run happens on the first adopting repo
  after T2 (baton itself has no publish targets).

### T2: `baton:init` sets up the `publish` environment and prints the trusted-publisher checklist  (#63)
- Priority: 2
- Depends on: T1, T4
- Owns: `skills/init/SKILL.md` (release step only), `tests/skills/init.md`
- Touches (additive): `cli/test/features.test.mjs` (one cross-check test)
- Acceptance:
  - [ ] The publishing sub-step keeps or deletes job and step blocks by the Contract markers,
        removes each deleted job's name from `publish`'s `needs:` line, and deletes `publish`
        when no target step is left.
  - [ ] After T1 merges, `releaseFindings` (T4) on the template trimmed for each target
        reports nothing (a test in `cli/test/features.test.mjs`, added here).
  - [ ] After the user confirms, it creates the `publish` environment with the user as required
        reviewer, limited to the base branch (exact `gh api` calls). It leaves "prevent
        self-review" off and suggests it when the repo has more than one maintainer.
  - [ ] It checks `gh repo view --json visibility`; for a private repo it says required
        reviewers aren't available on Free, Pro or Team, creates `publish` without reviewers,
        and says merging the release PR is then the only gate.
  - [ ] It prints the per-package checklist from the spec (owner exact case, repository,
        `release.yml`, environment `publish`; npm only: "npm publish" allowed, dist-tag not
        needed), and says crates.io has no allowed-actions setting.
  - [ ] First version: never a CI token; a short-lived 2FA-bypass granular token only when the
        maintainer can't publish interactively, deleted right after.
  - [ ] The tag ruleset suggestion may also restrict creation of `v*`, and names the
        `RELEASE_PLEASE_TOKEN` owner as a required bypass actor.
  - [ ] Existing adopters re-running the step are told to switch each trusted publisher's
        environment from `release` to `publish`.
- Tests first: init scenarios (red/green) for: the checklist with exact owner case and
  environment `publish`; a private repo gets the no-reviewer warning; a re-run on the old layout
  gets the trusted-publisher migration note.

### T3: `baton:release` handles approval, dry runs, registry checks, failures and rollback  (#61)
- Priority: 1
- Depends on: none
- Owns: `skills/release/SKILL.md`, `skills/release/failures.md` (new), `tests/skills/release.md`
- Acceptance:
  - [ ] Step 2: when `release.publish` is set and
        `git diff v<last>..origin/<base> -- .github/workflows/release.yml` is non-empty, it
        dispatches the dry run, waits for the run created after the dispatch, reports it, and a
        failed dry run blocks the merge.
  - [ ] Step 2: a release PR at `1.0.0` or a new major asks for a written versioning policy;
        without one it offers to draft it and doesn't merge until the maintainer confirms.
  - [ ] Step 5: a `publish` job waiting for approval is reported to the user, never approved or
        bypassed by the agent. The job named `publish` must succeed (`skipped` is a failure).
  - [ ] Step 5: registry checks poll every 30 s for up to 10 minutes; npm checks
        `dist.attestations` is non-empty and, for a package with `bin`, runs
        `npm exec --yes --package=<pkg>@<v> -- <bin> --version` in an empty temp dir and
        expects `<v>`.
  - [ ] `failures.md` has the spec's catalogue rows; the skill reads it when a run or check
        fails.
  - [ ] A "Broken release" section gives the maintainer `npm deprecate` / `cargo yank`
        commands to run themselves, never runs them, and points to a patch release.
  - [ ] Existing scenarios and the step 5 job check refer to the `publish` job; no
        `publish-npm` / `publish-crates` remains in `skills/release` or `tests/skills/release.md`.
  - [ ] Catalogue actions that re-run `publish` say it waits for approval again. A row covers a
        crates dry run failing on `--locked` (no tracked `Cargo.lock`).
  - [ ] The commit override marker appears only inside the example block. `SKILL.md` grows by
        no more than ~150 words; detail goes in `failures.md`.
- Tests first: release scenarios (red/green): publish waiting for approval; E403 on npm;
  registry 404 seconds after publishing; `release.yml` changed since the last tag; a broken
  release; a release PR proposing `1.0.0`.
- Notes: build against the Contract (job `publish`, input `dry_run`); T1 may not be merged yet.

### T4: `baton doctor` recognises the old publish layout  (#62)
- Priority: 2
- Depends on: none
- Owns: `releaseFindings` in `cli/lib/tasks.mjs`, its test in `cli/test/features.test.mjs`
- Acceptance:
  - [ ] With `release.publish` set, a workflow that has a `publish-npm` or `publish-crates` job
        is reported: "re-run the release step of baton:init".
  - [ ] A workflow whose `publish` job isn't in environment `publish` is reported.
  - [ ] A configured target with no `Publish to npm` / `Publish to crates.io` step in the
        `publish` job is reported (replaces today's `publish-<target>` job check).
  - [ ] A synthetic new-layout workflow built from the Contract, with both targets, reports
        nothing (the cross-check on the real template is in T2).
- Tests first: `releaseFindings_reports_old_publish_jobs`,
  `releaseFindings_reports_publish_job_outside_publish_environment`,
  `releaseFindings_reports_missing_target_step`, `releaseFindings_accepts_new_layout`.
- Notes: parse the job block by indentation as the existing regex does; no YAML dependency.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| One approval; ordinary merges don't wait (`publish` vs `release` environments) | T1, T2 |
| No registry published unless every package passed | T1 |
| npm before crates, re-run finishes | T1 |
| Dry run: no token/id-token/approval/tag | T1 |
| `baton:release` runs the dry run when `release.yml` changed | T3 |
| Init checklist with exact values | T2 |
| Failure catalogue | T3 |
| Post-release registry polling, provenance, `--version` smoke | T3 |
| Rollback guidance, agent never runs registry commands | T3 |
| Versioning policy before 1.0 / major | T3 |
| Private repo without reviewers | T2 |
| Tag ruleset extension | T2 |
| Old layout reported by doctor | T4 |
| Existing adopters' migration note | T2, T4 |
