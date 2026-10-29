---
name: release
description: Use when asked to cut, ship or check a release in a baton repo, or when a release PR, release run or publish job needs attention.
---

# Release

On demand, outside the per-task phases. This is not `baton release <n>`, the CLI command that
gives a task back. Never run that command here. If "release it" could mean merging a task's PR,
ask which one the user means before merging anything.

Releases come from release-please: it keeps one open release PR, and merging it creates the tag
`v<version>`, the GitHub Release and, if configured, the publish jobs in
`.github/workflows/release.yml`. Your job is to check that PR, fix bad entries at their source,
merge when told and confirm the result.

## 0. Check that releases are enabled

The session context says "Releases: on demand with baton:release", or `baton config` shows
`release.enabled: true`. If not, tell the user releases aren't enabled for this repo and that
the release step of `baton:init` turns them on. Then stop. **Don't set anything up yourself:**
no release-please files, workflow, config change, tag, `gh release create`, version bump or
`CHANGELOG.md`, even when the user is in a hurry.

## 1. Find the release PR

```bash
gh pr list --label "autorelease: pending"
gh run list --workflow release.yml --branch <baseBranch> -L 1
```

If there is no release PR:
- The latest run is queued or in progress: wait for it (`gh run watch <run-id>`) and list again.
- The latest run failed: report it with `gh run view <run-id> --log-failed` and stop. A missing
  or expired `RELEASE_PLEASE_TOKEN` is the usual cause, and only a maintainer can replace it.
- Otherwise nothing releasable merged since the last tag (only `docs`, `chore` and the like).
  Say so and stop.

**Never tag or create a Release by hand** to make up for a missing release PR, and don't offer
to, even when the user says you may.

## 2. Show what will ship

Show the version, the tag it creates (`v<version>`) and the notes (`gh pr diff <pr>`). Note the
PR's head SHA (`gh pr view <pr> --json headRefOid`). Flag each entry that doesn't read as a
user-facing change ("fix test", "wip"), and each commit whose type doesn't match its effect: a
`docs` or `chore` that changed behavior, or a `fix` that is really a feature.

## 3. Fix entries at their source

**Never edit `CHANGELOG.md`, version files or the release PR branch, even when asked to.**
release-please rebuilds them on every run. Fix the merged source PR's body instead:

```bash
gh pr view <source-pr> --json body -q .body > <file>
```

Append a block with the corrected Conventional Commit line. The same block fixes a wrong type:

```text
BEGIN_COMMIT_OVERRIDE
fix(profile): show dates in the member's language
END_COMMIT_OVERRIDE
```

Only when the user asks for a specific version, add a `Release-As: x.y.z` footer under that line
in the block, or in the body of a normal task PR (it becomes the squash commit body). Never push
to the base branch.

Show the new body and wait for the user's go-ahead. Then edit the body, note the time, and
dispatch:

```bash
gh pr edit <source-pr> --body-file <file>
gh workflow run release.yml
gh run list --workflow release.yml --event workflow_dispatch -L 1 --json databaseId,createdAt
```

`gh workflow run` returns before the run is listed, so the first listing can show the previous
run. List again until a run created after the dispatch appears, then:

```bash
gh run watch <run-id> --exit-status
gh pr diff <pr>
```

If the run fails, report it. The fix is done only when the diff shows the corrected entry, type
or version. If it doesn't, say the override didn't take effect. Then show the PR again (step 2).

## 4. Merge only when told

Merge the release PR only after the user says to in this conversation, and not because they are
in a hurry or said "cut a release". Releases require squash merges:

```bash
gh pr merge <pr> --squash --match-head-commit <head-sha>
```

If the merge is rejected or the head changed, show the PR again and ask again.

## 5. Confirm the release

The release run starts after the merge and may not be listed yet. List runs for the merge
commit until one appears, and don't judge the release until it exists and has finished:

```bash
gh run list --workflow release.yml --commit <merge-sha> --json databaseId,createdAt
gh run watch <run-id> --exit-status
gh run view <run-id>
gh release view v<version>
```

For each target in `release.publish`, the job `publish-npm` or `publish-crates` must show
success. A `skipped` publish job counts as a failure. Then check the registry for that exact
version: `npm view <package>@<version> version` or `cargo info <crate>@<version>`.

If a publish job failed, the tag and Release stay. Report the error and offer
`gh run rerun <run-id> --failed`. The job skips registries that already have the version, so a
re-run is safe. If the package itself is broken, fix it in a normal PR and release a patch.

**Never publish from your machine** (`npm publish`, `cargo publish`), and never re-tag, move or
delete a tag, or bump the version to recover. Don't offer these, even when the user wants it out
now and you have credentials. Only CI publishes, from the tag.

Report the version, tag, Release URL and the state of each publish target.
