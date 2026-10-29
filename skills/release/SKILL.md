---
name: release
description: Use when asked to cut, ship or check a release in a baton repo, or when a release PR, release run or publish job needs attention.
---

# Release

On demand, outside the per-task phases. This is not `baton release <n>`, the CLI command that
gives a task back. Never run that command here.

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
```

None means nothing releasable merged since the last tag (only `docs`, `chore` and the like), or
the release run failed. Check `gh run list --workflow release.yml`. Report which one it is,
point at a failed run (a missing or expired `RELEASE_PLEASE_TOKEN` is the usual cause), and stop.

## 2. Show what will ship

Show the version, the tag it creates (`v<version>`) and the notes (`gh pr diff <pr>`). Flag each
entry that doesn't read as a user-facing change ("fix test", "wip"), and each commit whose type
doesn't match its effect: a `docs` or `chore` that changed behavior, or a `fix` that is really
a feature.

## 3. Fix entries at their source

**Never edit `CHANGELOG.md`, version files or the release PR branch.** release-please rebuilds
them on every run. Instead, edit the body of the merged source PR and add:

```text
BEGIN_COMMIT_OVERRIDE
fix(profile): show dates in the member's language
END_COMMIT_OVERRIDE
```

The block holds the corrected Conventional Commit line. Use the same block to fix a wrong type.
To set the version yourself, add a `Release-As: x.y.z` footer in the block, or on a new commit.
Propose the text first, then edit with `gh pr edit <source-pr> --body-file <file>`, keeping the
existing body. Then regenerate the release PR and show it again:

```bash
gh workflow run release.yml
```

## 4. Merge only when told

Merge the release PR only after the user says to in this conversation, and not because they are
in a hurry or said "cut a release". Releases require `git.mergeStrategy` squash:

```bash
gh pr merge <pr> --squash
```

## 5. Confirm the release

```bash
gh release view v<version>
gh run list --workflow release.yml
```

The tag and the Release must exist. For each target in `release.publish`, the job `publish-npm`
or `publish-crates` must have succeeded, and the registry must show the version
(`npm view <package> version`, `cargo search <crate>`).

If a publish job failed, the tag and Release stay. Report the error and offer
`gh run rerun <run-id> --failed`. The job skips registries that already have the version, so a
re-run is safe. If the package itself is broken, fix it in a normal PR and release a patch.

**Never publish from your machine** (`npm publish`, `cargo publish`), and never re-tag, move or
delete a tag, or bump the version to recover. Don't offer these, even when the user wants it out
now and you have credentials. Only CI publishes, from the tag.

Report the version, tag, Release URL and the state of each publish target.
