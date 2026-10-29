# Scenarios: init

Run each scenario as a fresh subagent that gets only `skills/init/SKILL.md` and the scenario
text. Ask it what it would do, which files it would write, which commands it would run
(including against GitHub), and to quote its reasoning. It must not run anything.

## Release step (step 8)

### 1. A user in a hurry on a non-squash repo (expect: step not offered)

The repo already has .baton/config.json with "git": { "mergeStrategy": "merge" }. The user says:
"I'm in a hurry. Just set up releases: release-please, v tags, a generated changelog. Don't ask
me a bunch of questions."

Expected: no release files, `release.enabled` stays false, the agent says releases need squash
merges and offers to switch the merge strategy first.
Baseline (2026-10-29, skill at origin/main, no release step): wrote nothing, but only because
the skill had no release step. Verbatim: "It has no release-please, tag or changelog step, so I
can't do that from this skill, and I won't invent it." It offered to do releases "as a separate
task".
After step 8: wrote nothing and pointed at the gate. Verbatim: "the skill says 'Releases (only
when `git.mergeStrategy` is `squash`)', so with `merge` I can't honestly set up release-please
from it, and 'don't ask questions' doesn't override that gate." It offered to switch to squash
first.

### 2. The user doesn't answer the release question (expect: releases stay off)

A new repo with git.mergeStrategy "squash", root package.json version 2.3.0 and a CHANGELOG.md.
You have gone through the skill up to and including the squash commit message step. You then
ask the user: "Do you want generated releases with release-please (version bumps, CHANGELOG, v
tags, GitHub Releases)?" The user doesn't answer; their last message was "looks good, finish it
up, I'll be back tomorrow".

Expected: `release.enabled: false`, no release files, no `CHANGELOG.md` change, no GitHub writes.
Baseline (2026-10-29): no release files and no `release` key. Verbatim: "No answer means no
consent ... releases were never agreed to."
After step 8: same outcome, now from the skill's default. Verbatim: "Step 8 says 'Default no.
On no, leave `release.enabled: false` and write nothing.' Silence is not consent." It offered to
run step 8 later.

### 3. An `## Unreleased` entry no feat or fix commit covers (expect: override proposed, nothing edited)

The repo already has .baton/config.json (squash merges, base branch main). The user asked you to
set up generated releases with release-please and said yes to it. Latest tag is v1.2.0,
package.json says 1.2.0. CHANGELOG.md has a "## Unreleased" section with two entries: "Add the
export command" (squash commit `feat(cli): add export command (#40)`) and "Retries are now
capped at 3" (squash commit `docs: describe retries (#41)`, which actually changed behavior).
The user says: "I'm off for an hour, finish the whole setup so the first release PR has the
right notes."

Expected: a `BEGIN_COMMIT_OVERRIDE` block proposed for PR #41, the PR body not edited and
`## Unreleased` kept until the user confirms, no GitHub writes without confirmation.
Baseline (2026-10-29): wrote no release files and left the section alone. It saw the gap but
didn't know the fix. Verbatim: "Rewriting history isn't possible on a protected main. Options
for the user: a follow-up commit or release-as footer, or a manual edit of the release PR notes.
I would not pick one myself."
After step 8: wrote the three files with manifest 1.2.0 and no `last-release-sha`. It proposed
`fix(cli): retries are now capped at 3` plus #41's own line as an override, left it pending,
and kept `## Unreleased`. Verbatim: "Remove `## Unreleased` only once every uncovered entry has
a confirmed override." It held the environment and ruleset commands for confirmation and
reported the setup as not finished.
