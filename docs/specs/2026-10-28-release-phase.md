# Release phase — Spec

- Status: approved
- Date: 2026-10-28
- Owner: Arnold Gandarillas
- Related: [ADR-0001](../adr/0001-generated-changelog.md), #8, #16, #18

## TL;DR
- Releases are an opt-in feature: `release.enabled` in `.baton/config.json`, off by default.
  `baton:init` offers to turn it on. A repo that leaves it off gets no release setup
  (`baton:release` only says releases are off), no `CHANGELOG.md` and no changelog rules.
- When it is on, PRs never edit `CHANGELOG.md` or version files. The PR title is the changelog
  entry.
- release-please, a GitHub Action, keeps one open **release PR** with the next version and the
  generated notes. Merging it creates the tag `v<version>` (never `<package>-v<version>`) and the
  GitHub Release.
- Optional publishing (`release.publish`: `npm`, `crates`) runs in the same workflow, from that
  tag, after it exists, with trusted publishing and no long-lived registry token. The registry
  version always equals the tag without its `v`.
- A new on-demand skill, `baton:release`, cuts releases. It runs outside the per-task loop.
- `baton done` refuses a PR that edits `CHANGELOG.md` when releases are enabled on the base branch.
- baton enables releases for itself (no publishing: its `package.json` is private).

## Change in a nutshell
Today every PR adds a line under `## Unreleased` in `CHANGELOG.md`, so every two open PRs
conflict (#5, #8, #16 and #18 all did). With `release.enabled: true`:

```text
feat(init): suggest squash commits that use the PR title and body (#16)   <- PR title, squash-merged
        |
        v  release-please, on every push to main
"chore(main): release 0.2.0"   <- release PR: bumps version files, adds the CHANGELOG section
        |
        v  a maintainer merges it when they want to release
commit on main with version 0.2.0
        |
        v  same workflow run
tag v0.2.0 on that commit + GitHub Release "v0.2.0" with the same notes
        |
        v  only if release.publish is set, and only if a release was created
publish job: checks out v0.2.0, checks package version == tag, publishes 0.2.0 to npm / crates.io
```

Versions follow the commit types since the last tag: `fix` bumps the patch, `feat` bumps the
minor, and a breaking change (`!` or a `BREAKING CHANGE:` footer) bumps the minor before 1.0 and
the major after it. `perf` and `revert` bump the patch. `docs`, `chore`, `test`, `ci`, `build`,
`style` and `refactor` alone don't produce a release. A `Release-As: x.y.z` commit footer
overrides the computed version.

With `release.enabled: false` (the default), nothing in this spec applies: baton neither creates
nor asks for a `CHANGELOG.md`, and a repo's own changelog habits are left alone.

## Problem
`CHANGELOG.md` is a single shared file that every PR edits, which is the coordination problem
baton's use of issues instead of a roadmap file was meant to avoid. Parallel agents conflict on
it, and each conflict needs a merge, a re-run of validation and an updated `Reviewed-at`. The
version in `package.json` and `.claude-plugin/plugin.json` is also bumped by hand, and only
`v0.1.0` has ever been tagged. In repos that publish packages, a hand-run `npm publish` or
`cargo publish` can ship a version with no tag, or a tag can point at code that differs from
what was published. Not every project wants versioned releases, so the fix must not impose a
changelog on repos that don't.

## Goals / Success criteria
- One config key turns the whole feature on or off: the guard, the release skill, the session
  context line and the files `baton:init` writes.
- With it off, baton creates no `CHANGELOG.md`, adds no release files and never mentions a
  changelog to agents.
- With it on, a PR never needs to touch `CHANGELOG.md`, and `baton done` refuses one that does.
- Merging the release PR produces the version bump, the tag, the GitHub Release and, when
  configured, the registry publish, with no other manual step.
- The tag is exactly `v` plus the manifest version, the GitHub Release is named the same, and
  every listed version file and every published package carry that version.
- Nothing is published that isn't tagged. After a package's first version, only CI publishes.
- CI runs on the release PR, so branch protection lets it merge.
- `baton:init` can set this up in a new repo. The only steps it can't do are creating the token
  and configuring trusted publishing on the registry.
- baton itself releases 0.2.0 this way.

## Non-goals
- Per-package versions in monorepos or Cargo/npm workspaces. One version, one tag and one
  CHANGELOG per repo, published as one package per registry.
- Registries other than npm and crates.io, release tools other than release-please, providers
  other than GitHub, or scheduled releases.
- Signing tags or release artifacts beyond the provenance that npm trusted publishing adds.
- Rewriting existing hand-written CHANGELOG sections.
- Managing a hand-written changelog in repos that leave the feature off.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Agent | Write PR titles that read as changelog entries; inspect the release PR; fix a bad entry (see Behavior); merge the release PR when the user asks in that conversation; re-run a failed publish job when the user asks | Merge the release PR on its own initiative; edit `CHANGELOG.md` or version files in a task PR when releases are enabled; enable releases without the user confirming; run `npm publish` or `cargo publish`; create, move or delete a tag |
| Maintainer | Turn releases and publishing on or off; decide when to release by merging the release PR; create and rotate the token; configure trusted publishing on the registry | Publish by hand, except the first version of a new package, which the registry needs before trusted publishing can be set up; that one is published from its matching tag |
| release-please Action | Open and update the release PR; create tags and GitHub Releases | Push to `main` directly (it goes through the release PR) |
| Publish job | Exchange the workflow's OIDC identity for a short-lived registry token and publish the tagged version | Run on anything but a tag release-please just created |

The release-please token is a fine-grained personal access token scoped to the one repo, with
write access to contents, pull requests and issues (release-please labels its PRs). It is stored
as `RELEASE_PLEASE_TOKEN`, an environment secret in the `release` environment, limited to the
base branch, so a workflow pushed to another branch can't read it. The default `GITHUB_TOKEN` is not used, because PRs
it opens don't trigger other workflows, so the required `ci` check would never run on the
release PR. A fine-grained PAT expires (at most after a year), so note the date. The release
PR's author is the token owner, who can't approve it; once approvals are required, another
maintainer approves. Publishing uses trusted publishing (OIDC, `id-token: write` on the publish
job only), so no registry token is stored in the repo.

## Tenancy & localization
n/a. Release notes are generated in the language the PR titles are written in.

## Domain model
- **Release:** a version, its tag (`v<version>`), its GitHub Release (named `v<version>`), its
  `CHANGELOG.md` section and, when publishing is on, the same version on each registry. Created
  only by merging the release PR.
- **Release PR:** the single open PR maintained by release-please (label `autorelease: pending`).
  It is regenerated on every push to `main` until it is merged.
- **Version source:** `.release-please-manifest.json` holds the current version. The files that
  carry a version (`package.json`, `Cargo.toml`, `.claude-plugin/plugin.json`, ...) are listed in
  `release-please-config.json` and bumped together.

Invariants:
- After a release merges, the version in every listed file equals the latest tag without its
  `v`, and each configured registry has that version or the publish job for it failed visibly.
- A tag is never moved or deleted, and a version is never published twice or without a tag.
- `release.enabled` is true exactly when the three release files exist (`baton doctor` reports
  any mismatch).

## Interfaces
**Config:** a new top-level section, off by default:
```json
"release": { "enabled": false, "publish": [] }
```
- `publish` lists registries to publish to: `"npm"`, `"crates"`, or both. Default `[]`.
- `validateConfig` rejects:
  - `release.enabled: true` unless `git.mergeStrategy` is `squash`: "release.enabled requires
    git.mergeStrategy squash: every commit on the base branch must be a Conventional Commit."
  - a non-empty `publish` while `enabled` is false: "release.publish requires release.enabled."
  - an unknown `publish` entry: "unknown release.publish target '<x>' (known: npm, crates)."
- `baton init` (the CLI) writes `"release": { "enabled": false, "publish": [] }` into the
  generated config so the switch is visible. `templates/config.example.json` shows it.
- `release` is not a `workflow.phases` entry. Phases are the per-task sequence, and a release is
  not per task. `BUILTIN_PHASES` and the default phases don't change.

**Session context** (`cli/lib/context.mjs`): when `release.enabled` is true, one extra line:
"Releases: on demand with baton:release. Never edit CHANGELOG.md or version files in a task PR;
the PR title is the changelog entry." When it is false, no line, so agents in other repos never
hear about a changelog from baton.

**Files `baton:init` writes when the user enables releases** (templates in `templates/release/`):
- `release-please-config.json`: one package at `.`, `release-type` chosen from the root manifest
  (`node` for `package.json`, `rust` for `Cargo.toml`, otherwise `simple`, which keeps the
  version in `version.txt`), the other version files as `extra-files`, `bump-minor-pre-major:
  true`, and the tag settings `include-component-in-tag: false` and `include-v-in-tag: true`, so
  the tag and Release are `v0.2.0`, never `baton-v0.2.0`. When the latest existing tag isn't
  `v<version>`, it also sets `last-release-sha` to that release's commit.
- `.release-please-manifest.json`: `{ ".": "<current version>" }`, read from the existing
  version file, or `0.0.0` if there is none.
- `.github/workflows/release.yml`:
  - job `release-please`: runs `googleapis/release-please-action` on push to the base branch and
    on `workflow_dispatch`, in the environment `release`, with
    `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`, and exposes
    `release_created`, `tag_name` and `version` as job outputs. Actions are pinned to a full
    commit SHA with the released version in a comment. The workflow sets top-level `permissions:
    {}` (each job declares its own) and `concurrency: { group: release, cancel-in-progress:
    false }`.
  - one publish job per `release.publish` entry (`publish-npm`, `publish-crates`), present only
    when that target is configured. Each has `needs: release-please`, `if:
    needs.release-please.outputs.release_created == 'true'`, `permissions: { contents: read,
    id-token: write }`, and runs in a GitHub environment named `release`, limited to the base
    branch. Each checks out `tag_name`, fails unless the version in `package.json` (npm) or
    `Cargo.toml` (crates) equals `version` and `tag_name` is `v<version>`, skips if that version
    already exists on the registry, then publishes:
    - npm: `npm publish` with trusted publishing; provenance is attached automatically.
    - crates: `rust-lang/crates-io-auth-action` for a short-lived token, then `cargo publish`.

baton never writes `CHANGELOG.md` itself. release-please creates it on the first release if the
repo has none.

**`baton:init`:** a new step after the squash-message step. It asks whether the project wants
generated releases and explains the trade-off (versions and notes come from PR titles; needs a
token). The default is no. It is offered only when `git.mergeStrategy` is `squash`. On no, it
leaves `release.enabled: false` and writes nothing. On yes, it:
1. Sets `release.enabled: true` and writes the three files. Before removing an existing
   `## Unreleased` section, it checks each entry against the commits since the last tag and
   proposes a `BEGIN_COMMIT_OVERRIDE` on the source PR for any entry with no `feat` or `fix`
   commit, so the first generated notes don't drop it.
2. Asks whether to publish, offering only the registries the repo can publish to (`npm` for a
   root `package.json` without `"private": true`, `crates` for a root `Cargo.toml` without
   `publish = false`). Default none. It records the answer in `release.publish` and includes
   only those publish jobs.
3. Gives the exact manual steps: create the fine-grained PAT (Contents, Pull requests and Issues
   read and write) and save it as `RELEASE_PLEASE_TOKEN`, an environment secret in the `release`
   environment, limited to the base branch; for each publish target, add this repo,
   `release.yml` and the `release` environment as a trusted publisher on the registry. If the
   package isn't on the registry yet, publish its current version once by hand from its tag
   first: both registries need the package to exist before a trusted publisher can be added.
   Once CI has published a release, revoke any old registry tokens.
4. Suggests, and runs only after the user confirms: a tag ruleset that blocks updating or
   deleting `v*` tags, turning on immutable releases for the repo and creating the `release`
   environment limited to the base branch.
5. For each publish target, suggests adding a dry run (`npm publish --dry-run`,
   `cargo publish --dry-run`) to the repo's CI script, so a package that can't publish fails on
   the PR instead of at release.
6. Re-runs `baton doctor`, so the release checks run.

The step can run on its own in a repo that already has `.baton/config.json`, without
`baton init` (which refuses when a config exists).

**`baton:release`** (new skill, on demand). It is not `baton release <n>`, the CLI command that
gives a task back, and it never runs that command.
0. If `release.enabled` is false, say releases aren't enabled for this repo, point at the
   `baton:init` release step, and stop. Don't set anything up ad hoc.
1. Find the release PR (`gh pr list --label "autorelease: pending"`). If there is none, report
   that nothing releasable has merged since the last tag, and stop.
2. Show the version, the tag it will create (`v<version>`) and the notes. Flag entries that
   don't read as a user-facing change.
3. Fix bad entries by editing the source PR's body (see Behavior), then run
   `gh workflow run release.yml` so release-please regenerates the release PR.
4. Merge the release PR only after the user says to, using the repo's merge strategy.
5. Confirm the release: the tag and the GitHub Release exist (`gh release view v<version>`),
   and, for each publish target, the publish job succeeded and the registry shows the version.
   If a publish job failed, report it and offer to re-run it (`gh run rerun --failed`). Never
   publish from the agent's machine, re-tag, or bump the version to recover.

**`baton done`:** reads `release.enabled` from the base branch's `.baton/config.json`, at the
same ref `branchDiff` compares against. When it is true and the diff changes `CHANGELOG.md`, it
refuses with: "CHANGELOG.md is
generated at release. Revert it; the PR title is the changelog entry." When it is false or
absent there, there is no check. Reading the base branch, not the worktree, lets the PR that
turns releases on also remove `## Unreleased`. The release PR is never opened through
`baton done`, so it is not affected.

**`baton doctor`:** reports
- `release.enabled` true with any of the three release files missing;
- `release.enabled` false with any release file present;
- `release-please-config.json` that doesn't set `include-component-in-tag: false` and
  `include-v-in-tag: true`;
- `npm` in `release.publish` with a private or missing root `package.json`, and `crates` with
  a missing root `Cargo.toml` or `publish = false`;
- a publish target with no matching job in `release.yml`.

**Skills and docs:** the workflow skill lists `baton:release` as on demand and routes "cut a
release" to it in every repo; the skill stops at step 0 when releases are off. `baton:integrate`
says, for repos with releases enabled, that the PR title is the changelog entry: write it for
users and never edit `CHANGELOG.md` or version files, and never publish or tag by hand. In every
repo, it says to pick `feat`/`fix` by effect: skill or guide text that changes agent behavior is
`feat` or `fix`, not `docs`, and a breaking change puts `!` in the title and `BREAKING CHANGE:`
in the PR body, which becomes the squash commit body (#16). The README says releases and
publishing are opt-in and how to turn them on. baton's own CONTRIBUTING and CHANGELOG header say
the file is generated.

## Behavior & edge cases
- **Releases off (default):** no guard, no context line, no release files, no `CHANGELOG.md`
  from baton. `baton:release` says releases aren't enabled. A repo that keeps its own
  hand-written changelog keeps doing so; baton doesn't police it.
- **The PR that turns releases on:** it sets the key, adds the files and removes
  `## Unreleased`. The guard reads the base branch, where the key is still off, so it passes.
  The guard applies from the next PR on.
- **Turning releases on later, or adding a publish target:** re-run the `baton:init` release
  step. It rewrites the three files from the templates and the current config, and doesn't need
  `baton init`.
- **Turning releases off:** set `release.enabled: false`, `publish: []` and delete the three
  files. `baton doctor` reports a half-done switch. The existing `CHANGELOG.md` and tags stay as
  history.
- **No releasable commits** (only docs, chore and the like): no release PR. `baton:release`
  says so.
- **A badly worded entry:** edit the merged source PR's body to add a
  `BEGIN_COMMIT_OVERRIDE ... END_COMMIT_OVERRIDE` block with the corrected Conventional Commit
  line, then run `gh workflow run release.yml` (or wait for the next push) so release-please
  picks it up.
- **A commit merged with the wrong type** (`docs` for a behavior change): fix it the same way.
- **Version override:** add a `Release-As: x.y.z` footer through the same override, or on a
  commit.
- **Release PR conflicts:** none to resolve by hand, since release-please rebuilds it on every push.
- **Missing or expired token:** the release workflow fails visibly on `main`, and
  `baton:release` reports that no release PR exists and points at the failed run.
- **Publish fails after the tag exists** (registry outage, trusted publisher not configured):
  the tag and Release stay. Re-run the failed job; it skips registries that already have the
  version. If the package itself is broken, fix it in a normal PR and release a patch. Never
  move or delete the tag.
- **Version already on the registry** (a re-run, or a past hand publish): the job skips that
  registry and succeeds, so re-runs are safe.
- **First version of a new package:** the registry needs the package before a trusted publisher
  can be set up, so the maintainer publishes that one version by hand from its tag. CI publishes
  every later version.
- **Tag and package version disagree** in the publish job: it fails before publishing. This only
  happens if someone edited version files by hand. Fix them in a PR and release with a
  `Release-As` override.
- **Package not publishable** (`"private": true`, `publish = false`): init doesn't offer that
  target, and `baton doctor` reports it if it is configured anyway.
- **`git.mergeStrategy` is not `squash`:** init doesn't offer the release step, and the config is
  rejected if `release.enabled` is set anyway. Every commit on `main` would have to be a
  Conventional Commit, which baton doesn't enforce.
- **Hand-written history:** existing CHANGELOG sections stay. The `## Unreleased` section is
  removed when releases are enabled. Entries whose commit isn't a `feat` or `fix` (or isn't a
  Conventional Commit at all) get a commit override first, so the generated notes still list them.
- **Existing tags with another format** (`baton-v0.1.0`, `0.1.0`): release-please finds the last
  release by matching tags and GitHub Releases against the expected format, so it can't find
  these and would list every past commit. Init sets `last-release-sha` in
  `release-please-config.json` to the commit of the last release. New tags use `v<version>`.

## Data & migrations
Existing configs have no `release` key, so they merge to `enabled: false`, `publish: []` and see
no change. For baton itself: set `release.enabled: true` with `publish: []` (its `package.json`
is private), add the three files with manifest version `0.1.0`, `extra-files` for
`.claude-plugin/plugin.json` (`$.version`) and `include-component-in-tag: false`, add commit
overrides for the `## Unreleased` entries that no `feat` or `fix` commit covers (#2, #3, #18),
remove that section, and add `RELEASE_PLEASE_TOKEN` as an environment secret in the `release`
environment, limited to the base branch. The existing tag is `v0.1.0`
with a GitHub Release, which matches, so no `last-release-sha` is needed. The first release PR
will be 0.2.0, because there are `feat` commits since `v0.1.0`. Adopting repos opt in through
`baton:init`.

## Testing strategy
- Unit: `baton done`'s guard refuses a diff that touches `CHANGELOG.md` when the base branch has
  `release.enabled: true`, and allows it when it is false there, including when only the
  worktree turns it on. `validateConfig` rejects `release.enabled` with a non-squash merge
  strategy, `publish` without `enabled`, and unknown targets. The default config has
  `release.enabled: false` and `publish: []`. The session context has the release line only
  when enabled. `baton doctor` reports each mismatch it lists.
- Templates: `make ci` parses the JSON templates, checks `include-component-in-tag: false` and
  `include-v-in-tag: true`, checks that the workflow references `RELEASE_PLEASE_TOKEN` and runs
  on `workflow_dispatch`, that every publish job needs `release-please`, is gated on
  `release_created`, checks out `tag_name`, has `id-token: write` only on publish jobs, and
  checks the version against the tag before publishing, and that every `uses:` is pinned to a
  40-character SHA.
- Skill: red/green subagent scenarios for `baton:release`: a release PR with a badly worded
  entry (propose an override, don't edit `CHANGELOG.md`, don't merge unprompted); releases
  disabled (don't set up release-please); a publish job that failed after the tag was created
  (offer to re-run the job; don't publish locally, re-tag or bump).
- Live: baton's first release. The release PR opens, CI runs on it, and merging it creates the
  tag `v0.2.0`, a GitHub Release named `v0.2.0`, and a bumped `plugin.json` and `package.json`.
  Publishing is verified live by the first adopting repo that enables it.

## Decisions
- [ADR-0001](../adr/0001-generated-changelog.md): in repos that enable releases, the changelog
  and version are generated from Conventional Commit PR titles at release time and never edited
  by hand; tags are `v<version>`; only CI publishes, from the tag.
- Releases are opt-in through `release.enabled`, not a `workflow.phases` entry (see FAQ).
- `CONTEXT.md`: adds Release and Release PR.

## FAQ
### Why release-please rather than git-cliff or changeset files?
git-cliff needs someone to run it and push the result. Changeset files avoid conflicts but add
a file per PR and a merge step. release-please needs no extra files per PR and already uses
the Conventional Commit titles that baton enforces.

### Why a config flag rather than a `release` entry in `workflow.phases`?
Phases are the ordered per-task sequence, and a release isn't per task. The switch also has to
turn on the guard, the context line and the files init writes; one key keeps them in step. A
phase in the defaults would also have shown up in every adopting repo, including the ones that
don't want releases.

### Why off by default?
Not every project versions its releases, and the feature needs a token that only a maintainer
can create. A repo that doesn't ask for it should see no difference.

### Will the published version always match the tag?
Yes. The version comes from one file, the manifest. release-please bumps `package.json` or
`Cargo.toml` to it, tags that exact commit `v<version>`, and the publish job checks out that tag
and refuses to publish if the package file disagrees. Publishing a crate or package as `0.2.0`
therefore always comes from tag `v0.2.0`. Registries never carry the `v`; the tag always does.
Only the first version of a new package is published by hand, from its tag, because the registry
needs it before trusted publishing works.

### Why does the tag come before the publish?
release-please creates the tag and Release in the same step that detects the release, and the
publish job needs the tag to check out. The other order would need a draft release that is
published after the registry upload, which adds a failure mode for little gain. A tag without a
package is recoverable by re-running the job; a package without a tag is not.

### Why trusted publishing instead of an `NPM_TOKEN` or `CARGO_REGISTRY_TOKEN` secret?
A stored registry token is long-lived and can publish from anywhere. Trusted publishing gives
the publish job a short-lived token bound to this repo, this workflow and the `release`
environment, and npm adds provenance that links the package to the run.

### Why a personal access token for release-please rather than a GitHub App?
It is the least setup for small teams. A GitHub App is a valid swap later: only the `token:` line
in the workflow changes.

## Open questions
None.

## Implementation status
- [ ] Plan: [docs/plans/2026-10-28-release-phase.md](../plans/2026-10-28-release-phase.md) (T1-T6: #20-#25)
