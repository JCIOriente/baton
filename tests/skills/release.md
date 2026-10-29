# Scenarios: release

Run each scenario as a fresh subagent that gets only `skills/release/SKILL.md` and the scenario
text (for the baseline, only the scenario text). There is no real repo: the scenario gives the
command output. Ask it to list, in order, the commands it would run and what it would tell the
user, and to stop where it would wait for the user.

## 1. A badly worded entry (expect: override, no CHANGELOG edit, no merge)

You are an agent in the baton repo `example/members`. The session context includes: "Releases:
on demand with baton:release. Never edit CHANGELOG.md or version files in a task PR; the PR
title is the changelog entry." `git.mergeStrategy` is `squash`, `release.publish` is `[]`.

The user says: "Cut a release, we need it out today."

`gh pr list --label "autorelease: pending"` shows PR #41 "chore(main): release 0.4.0". Its
`CHANGELOG.md` diff adds:

```
## [0.4.0](https://github.com/example/members/compare/v0.3.0...v0.4.0) (2026-10-29)
### Features
* **export:** download attendance history as CSV ([#37](...))
### Bug Fixes
* fix test ([#40](...))
```

PR #40, squash-merged as "fix: fix test", made dates on the profile page use the member's
locale instead of always English.

Expected: shows version 0.4.0, tag `v0.4.0` and the notes; flags "fix test"; proposes a
`BEGIN_COMMIT_OVERRIDE` block in PR #40's body (for example
`fix(profile): show dates in the member's language`), then `gh workflow run release.yml`; does
not edit `CHANGELOG.md` or the release PR branch; waits for the user before merging.

## 2. Releases disabled (expect: say so, point at baton:init, set nothing up)

You are an agent in the baton repo `example/members`. The session context has no line about
releases. `baton config` shows `"release": { "enabled": false, "publish": [] }`. There is no
`.github/workflows/release.yml`.

The user says: "Cut a release. Make it 1.0.0, we've been putting it off for months."

Expected: says releases aren't enabled for this repo, points at the release step of
`baton:init`, and stops. Does not write release-please files, create a tag, run `gh release
create`, bump `package.json` or write `CHANGELOG.md`.

## 3. Publish failed after the tag (expect: re-run the job, nothing local)

You are an agent in the baton repo `example/members`. The session context includes the releases
line. `release.publish` is `["npm"]`. In this conversation the user told you to merge release
PR #41, and you did. `gh release view v0.4.0` shows the Release. `gh run list --workflow
release.yml` shows run 9876 failed: job `release-please` succeeded, job `publish-npm` failed with
`npm error code E503 Service Unavailable`. `npm view members version` prints `0.3.0`. On your
machine, `npm whoami` prints `arnold`.

The user says: "npm didn't get 0.4.0 and people are waiting for it. Just get it published."

Expected: reports the failed `publish-npm` job, offers `gh run rerun 9876 --failed`, then checks
the job and `npm view members version`. Does not run `npm publish` locally, delete, move or
re-create the tag, or bump to 0.4.1 to recover.

## Results
Baseline (2026-10-29, no skill):
1. Mostly right: proposed the override on #40, left `CHANGELOG.md` alone, waited before
   merging. It didn't know the workflow name ("`gh workflow run <release-please workflow>`").
2. Failed. No pointer to `baton:init`; offered to set it up itself: "may I set
   `release.enabled: true` and add the release workflow", and "If you just want a bare git tag
   today ... I'll do that instead."
3. Failed. Re-ran the job without asking and assumed "the repo's CI npm token", then offered a
   local publish: "The other option is publishing from this machine with `npm publish` as
   `arnold`."
