# Release phase — Spec

- Status: draft
- Date: 2026-10-28
- Owner: Arnold Gandarillas
- Related: [ADR-0001](../adr/0001-generated-changelog.md), #8, #16, #18

## TL;DR
- PRs no longer edit `CHANGELOG.md`. The PR title is the changelog entry.
- release-please, a GitHub Action, keeps one open **release PR** with the next version and the
  generated notes. Merging it creates the tag and the GitHub Release.
- A new built-in `release` phase (`baton:release`) runs on demand, outside the per-task loop.
- `baton:init` sets this up for adopting repos, and baton uses it for itself.
- `baton done` refuses a PR that edits `CHANGELOG.md` when release-please is configured.

## Change in a nutshell
Today every PR adds a line under `## Unreleased` in `CHANGELOG.md`, so every two open PRs
conflict (#5, #8, #16 and #18 all did). After this change:

```text
feat(init): suggest squash commits that use the PR title and body (#16)   <- PR title, squash-merged
        |
        v  release-please, on every push to main
"chore(main): release 0.2.0"   <- release PR: bumps versions, adds the CHANGELOG section
        |
        v  a maintainer merges it when they want to release
tag v0.2.0 + GitHub Release with the same notes
```

Versions follow the commit types since the last tag: `fix` bumps the patch, `feat` bumps the
minor, and a breaking change (`!` or a `BREAKING CHANGE:` footer) bumps the minor before 1.0
and the major after it. `docs`, `chore`, `test`, `ci` and `refactor` alone don't produce a
release. A `Release-As: x.y.z` commit footer overrides the computed version.

## Problem
`CHANGELOG.md` is a single shared file that every PR edits, which is the coordination problem
baton's use of issues instead of a roadmap file was meant to avoid. Parallel agents conflict on
it, and each conflict needs a merge, a re-run of validation and an updated `Reviewed-at`. The
version in `package.json` and `.claude-plugin/plugin.json` is also bumped by hand, and only
`v0.1.0` has ever been tagged.

## Goals / Success criteria
- A PR in a repo with release-please configured never needs to touch `CHANGELOG.md`.
  `baton done` refuses one that does.
- Merging the release PR produces the tag, the GitHub Release and bumped version files with no
  other manual step.
- CI runs on the release PR, so branch protection lets it merge.
- `baton:init` can set this up in a new repo. The only step it can't do is creating the token.
- baton itself releases 0.2.0 this way.

## Non-goals
- Per-package versions in monorepos. One version, one tag and one CHANGELOG per repo.
- Publishing to package registries (npm, crates.io).
- Release tools other than release-please, providers other than GitHub, or scheduled releases.
- Rewriting existing hand-written CHANGELOG sections.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Agent | Write PR titles that read as changelog entries; inspect the release PR; fix a bad entry (see Behavior); merge the release PR when the user asks in that conversation | Merge the release PR on its own initiative; edit `CHANGELOG.md` or version files in a task PR |
| Maintainer | Decide when to release by merging the release PR; create and rotate the token | |
| release-please Action | Open and update the release PR; create tags and GitHub Releases | Push to `main` directly (it goes through the release PR) |

The token is a fine-grained personal access token scoped to the one repo, with write access to
contents, pull requests and issues (release-please labels its PRs). It is stored as the repo
secret `RELEASE_PLEASE_TOKEN`. The default `GITHUB_TOKEN` is not used, because PRs it opens
don't trigger other workflows, so the required `ci` check would never run on the release PR.

## Tenancy & localization
n/a. Release notes are generated in the language the PR titles are written in.

## Domain model
- **Release:** a version, its tag (`v<version>`), its GitHub Release and its `CHANGELOG.md`
  section. Created only by merging the release PR.
- **Release PR:** the single open PR maintained by release-please (label `autorelease: pending`).
  It is regenerated on every push to `main` until it is merged.
- **Version source:** `.release-please-manifest.json` holds the current version. The files that
  carry a version (`package.json`, `Cargo.toml`, `.claude-plugin/plugin.json`, ...) are listed in
  `release-please-config.json` and bumped together.

Invariant: the version in every listed file equals the latest tag after a release merges.

## Interfaces
**Files `baton:init` writes** (templates in `templates/release/`):
- `.github/workflows/release.yml`: runs `googleapis/release-please-action` on push to the base
  branch with `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`.
- `release-please-config.json`: one package at `.`, `release-type` chosen from the detected
  stacks (`node` when there is a root `package.json`, otherwise `simple`), the other version
  files as `extra-files`, and `bump-minor-pre-major: true`.
- `.release-please-manifest.json`: `{ ".": "<current version>" }`, read from the existing
  version file, or `0.0.0` if there is none.

**`baton:init`:** a new step after the squash-message step. It is suggested and runs only after
the user confirms, requires `git.mergeStrategy: squash`, writes the three files, and gives the
user the exact steps to create the token and add the secret. It can't create the token itself.

**`baton:release`** (new skill, phase `release`, on demand):
1. Find the release PR (`gh pr list --label "autorelease: pending"`). If there is none, report
   that nothing releasable has merged since the last tag, and stop.
2. Show the version and notes. Flag entries that don't read as a user-facing change.
3. Fix bad entries by editing the source PR's body (see Behavior). release-please then
   regenerates the release PR.
4. Merge the release PR only after the user says to, using the repo's merge strategy.
5. Confirm that the tag and the GitHub Release exist (`gh release view v<version>`).

**`baton done`:** when `release-please-config.json` exists at the repo root and the diff against
the base branch changes `CHANGELOG.md`, it refuses with: "CHANGELOG.md is generated at release.
Revert it; the PR title is the changelog entry." The release PR is never opened through
`baton done`, so it is not affected.

**Config:** `release` joins `BUILTIN_PHASES` (`cli/lib/config.mjs:9`) and becomes the last
default phase. The workflow skill describes it as on demand, run when someone asks to cut a
release, not after each task. No new config keys.

**Skills and docs:** `baton:integrate` says the PR title is the changelog entry: write it for
users, and pick `feat`/`fix` by effect. Skill or guide text that changes agent behavior is
`feat` or `fix`, not `docs`. Breaking changes put `!` in the title and `BREAKING CHANGE:` in
the PR body, which becomes the squash commit body (#16). CONTRIBUTING and the README say the
same, and the CHANGELOG header says the file is generated.

## Behavior & edge cases
- **No releasable commits** (only docs, chore and the like): no release PR. `baton:release`
  says so.
- **A badly worded entry:** edit the merged source PR's body to add a
  `BEGIN_COMMIT_OVERRIDE ... END_COMMIT_OVERRIDE` block with the corrected Conventional Commit
  line. release-please uses it the next time it runs.
- **A commit merged with the wrong type** (`docs` for a behavior change): fix it the same way.
- **Version override:** add a `Release-As: x.y.z` footer through the same override, or on a
  commit.
- **Release PR conflicts:** none to resolve by hand, since release-please rebuilds it on every push.
- **Missing or expired token:** the release workflow fails visibly on `main`, and
  `baton:release` reports that no release PR exists and points at the failed run.
- **`git.mergeStrategy` is not `squash`:** init doesn't offer the release step. Every commit on
  `main` would have to be a Conventional Commit, which baton doesn't enforce.
- **Hand-written history:** existing CHANGELOG sections stay. The `## Unreleased` section is
  removed when release-please is enabled, because the generated notes cover the same commits.

## Data & migrations
For baton itself: add the three files with manifest version `0.1.0` and `extra-files` for
`.claude-plugin/plugin.json` (`$.version`), remove `## Unreleased` from `CHANGELOG.md`, and add
the `RELEASE_PLEASE_TOKEN` secret. The first release PR will be 0.2.0, because there are
`feat` commits since `v0.1.0`. Adopting repos migrate the same way through `baton:init`.

## Testing strategy
- Unit: `baton done` refuses a diff that touches `CHANGELOG.md` when the release config exists,
  and allows it when the config doesn't exist. `release` is a valid built-in phase.
- Templates: `make ci` parses the JSON templates and checks that the workflow references
  `RELEASE_PLEASE_TOKEN`.
- Skill: a red/green subagent scenario for `baton:release`. The release PR has a badly worded
  entry, and the agent must propose an override instead of editing `CHANGELOG.md`, and must not
  merge without being told to.
- Live: baton's first release. The release PR opens, CI runs on it, and merging it creates
  `v0.2.0`, the GitHub Release, and a bumped `plugin.json` and `package.json`.

## Decisions
- [ADR-0001](../adr/0001-generated-changelog.md): the changelog and version are generated from
  Conventional Commit PR titles at release time and never edited by hand.
- `CONTEXT.md`: adds Release and Release PR.

## FAQ
### Why release-please rather than git-cliff or changeset files?
git-cliff needs someone to run it and push the result. Changeset files avoid conflicts but add
a file per PR and a merge step. release-please needs no extra files per PR and already uses
the Conventional Commit titles that baton enforces.

### Why is `release` a phase if it doesn't run per task?
It is part of the workflow that a project can drop or reorder like any other phase. Making it a
phase lets the workflow skill route "cut a release" to it.

### Why a personal access token rather than a GitHub App?
It is the least setup for small teams. A GitHub App is a valid swap later: only the `token:` line
in the workflow changes.

## Open questions
None.

## Implementation status
- [ ] Plan: [docs/plans/2026-10-28-release-phase.md](../plans/2026-10-28-release-phase.md) (T1-T5)
