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
merge when told and confirm the result. On any failed run, job or check, read
`${CLAUDE_PLUGIN_ROOT}/skills/release/failures.md`.

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

Then list the PRs merged since the previous release PR:

```bash
gh pr list --label "autorelease: tagged" --state merged --base <baseBranch> -L 1 --json mergedAt
gh pr list --state merged --base <baseBranch> --search "merged:><mergedAt>" -L 200 --json number,title
```

If there is no previous release PR, list from the start of the base branch. If the list has 200
entries, say it may be cut off. Report each `feat`, `fix`, `perf` or `!` PR whose title is
missing from the notes. First check its body for the commit override marker in prose:
release-please reads everything after it as the commit. Fix it in step 3.

If `release.publish` has at least one target, get the PR's branch (`gh pr view <pr> --json
headRefName`), run `git fetch origin <branch> --tags`, take `v<last>` from
`gh release list -L 1 --exclude-drafts --json tagName` and check
`git diff v<last>..origin/<branch> -- .github/workflows/release.yml`. If it isn't empty, or
there is no previous Release, run `gh workflow run release.yml --ref <branch> -f dry_run=true`.
**Don't merge until the run created after it succeeded** and `gh run view <run-id> --json jobs`
shows a dry run (`release-please` skipped). A dispatch error, no run, or a failed or cancelled
run blocks the merge, whatever the user says.

For `1.0.0` or a new major, ask where the versioning and stability policy is written down. If
nowhere, offer to draft one from the code, and don't merge until the maintainer confirms it.

## 3. Fix entries at their source

**Never edit `CHANGELOG.md`, version files or the release PR branch, even when asked to.**
(Except step 4's `gh pr update-branch`, which only merges in the base.)
release-please rebuilds them on every run. Fix the merged source PR's body instead:

```bash
gh pr view <source-pr> --json body -q .body > <file>
```

Append a block with the corrected Conventional Commit line. The same block fixes a wrong type.
If the body mentions the marker in prose, reword it to "a commit override block". **Never write
the marker text outside the block**, not even in backticks:

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

Merge only after the user says to in this conversation, not because they're in a hurry or said
"cut a release". Then read `gh pr view <pr> --json mergeStateStatus,headRefOid`:

- `UNKNOWN`: read again shortly.
- `BLOCKED` with pending checks: watch them, then read again.
- `BEHIND`: if step 1's release run is in progress, wait and read again (a `feat` or `fix`
  changes the notes). Else `gh pr update-branch <pr>`, read `headRefOid` again, and once
  `gh pr checks <pr>` lists that head's checks, add `--watch`. Then redo step 2's
  `release.yml` check.

Show the head you'll merge. If `gh pr diff <pr>` no longer shows the approved notes, show the PR
and ask again. Then squash-merge:

```bash
gh pr merge <pr> --squash --match-head-commit <head-sha>
```

**Never merge with `--admin` or change branch protection**, even when told to. If
`update-branch` doesn't change the head, or on `BLOCKED`, `DIRTY`, a failed check or a rejected
merge, report it and stop.

## 5. Confirm the release

The release run starts after the merge and may not be listed yet. List runs for the merge
commit until one appears, and don't judge the release until it exists and has finished:

```bash
gh run list --workflow release.yml --commit <merge-sha> --json databaseId,createdAt
gh run watch <run-id> --exit-status
gh run view <run-id>
gh release view v<version>
```

If `release.publish` has at least one target, `publish` must succeed (`skipped` fails). While
it waits for approval, ask the user to approve it on the run page and keep watching. **Never
approve or bypass it yourself**, even as an admin.

Then poll each registry every 30 seconds, for up to 10 minutes, before calling the version
missing: `npm view <package>@<version> version` must print exactly `<version>`, and
`cargo info <crate>@<version> --registry crates-io` must find it. For npm in a public repo,
`npm view <package>@<version> dist.attestations --json` must be non-empty. For each name in
`npm view <package>@<version> bin --json`, `npm exec --yes --package=<package>@<version> --
<bin> --version`, run in an empty temp directory (a disposable sandbox if available: it runs the
published code), must print output containing `<version>`.

On a failure the tag and Release stay: give the matching `failures.md` action, and for a broken
package its "Broken release" section. With no row, report the log and offer
`gh run rerun <run-id> --failed`, which waits for approval of `publish` again.

**Never publish from your machine** (`npm publish`, `cargo publish`), and never re-tag, move or
delete a tag, or bump the version to recover. Don't offer these, even when the user wants it out
now and you have credentials. Only CI publishes, from the tag.

Report the version, tag, Release URL and the state of each publish target.
