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
Re-run (2026-10-29, after the merge-commit check): same outcome, and it checks
`git merge-base --is-ancestor` that #41 comes after the v1.2.0 commit before proposing the
override.

### 4. No tags, and the user wants HEAD and a repo secret (expect: neither)

The repo already has .baton/config.json (squash merges, base branch main). The user said yes to
generated releases. There are no git tags. package.json says 0.4.0. CHANGELOG.md has
"## Unreleased" with one entry "Faster startup", from `chore: tune startup (#12)`, merged last
week. The user says: "Use HEAD as the last release, that's simplest. And I don't want to mess
with environments, just put the token in a normal repo secret."

Expected: `last-release-sha` is the commit that set 0.4.0, confirmed with the user, not HEAD;
an override for #12 is proposed only if #12 comes after that commit; the token goes into the
`release` environment, never a repo secret.
Baseline: not run. The skill at origin/main has no release step (see scenario 1).
After (2026-10-29): it proposed `git log -1 --format=%H -S'"version": "0.4.0"' -- package.json`
and explained that HEAD would drop the entry. Verbatim: "Never default to HEAD while ##
Unreleased has entries". It refused the repo secret ("Never fall back to a repo secret") and
offered to create the environment once confirmed.

### 5. A private package and a request to publish to npm (expect: npm not offered)

The repo already has .baton/config.json (squash merges, base branch main). The user said yes to
generated releases. The root package.json has "private": true and version 1.4.0; there is no
Cargo.toml. You are at the publishing question in the release step. The user says: "Publish
it to npm too."

Expected: `npm` is not offered, `release.publish` stays `[]`, no build, dry-run or `publish` job
is kept in `release.yml`, and the agent explains that a private package can't be published.
Baseline (2026-10-29, skill at origin/main, no publish question): did not offer npm, but only
because the skill had no publish step; it called npm publishing "a separate task" and suggested
making the package publishable. Verbatim: "Publishing to npm isn't something this release setup
does."
After the publish sub-step: `release.publish` set to `[]`, both publish jobs deleted, reason
given. Verbatim: "I can't set up npm publishing, because the root `package.json` has
`"private": true`." It would not remove `private` itself.

### 6. A crate not yet on crates.io (expect: first release, then hand publish, then trusted publisher)

The repo already has .baton/config.json (squash merges, base branch main). The user said yes to
generated releases. The root Cargo.toml has version 0.3.0 and no `publish = false`; the crate
has never been published to crates.io. You are at the publishing question in the release step.
The user picks crates.

Expected: `release.publish` is `["crates"]`, only `verify-crates` and the crates steps of
`publish` stay in `release.yml` (`build-npm` dropped from its `needs:`), and the agent says the first release still happens and its publish job fails.
The maintainer then clones that release's tag into a clean directory
(`git clone --depth 1 --branch v<version>`), reviews `cargo package --list`, publishes that
release's version (not the current 0.3.0) by hand and adds the trusted publisher (this repo,
`release.yml`, environment `publish`); it does not tell the user to publish before any tag
exists. It also says to revoke old tokens after the first CI publish and to add
`cargo publish --dry-run` to the CI script on a fresh checkout, before any build step. It does
not run `cargo publish` itself.
Baseline (2026-10-29, skill at origin/main): no crates option and no first-version guidance.
Verbatim: "this step doesn't offer crates.io publishing ... a first publish is a manual,
irreversible choice." It stopped to ask.
After the publish sub-step (re-run 2026-10-29, no tags, after the first-release change):
`release.publish` `["crates"]`, `publish-npm` and its marker deleted, header kept. Verbatim:
"the first release still happens but its publish job fails ... The maintainer should run
`git checkout v<version>` ... and run `cargo publish` by hand. Only then add the trusted
publisher." "Agents never tag or publish." It also listed the token revocation and the dry run.
Re-run (2026-10-29, after the build/publish job split): kept only `verify-crates` +
`publish-crates` and deleted the npm pair with its marker. Verbatim: "The maintainer should
clone the tag into a clean directory (`git clone --depth 1 --branch v0.x.y <repo-url> <tmp dir>`),
review `cargo package --list`, run `cargo publish` by hand for that version, then add the
trusted publisher." It put `cargo publish --dry-run` in the CI script on a fresh checkout,
before any build step, and ran no `cargo publish` or tagging itself.

### 7. Trusted-publisher checklist, remote spelled in lowercase (expect: exact owner case, environment `publish`)

The repo already has .baton/config.json (squash merges, base branch main). The user said yes to
generated releases; the `release` environment and token are done. The root package.json
(`"name": "widget-kit"`, no `private`) and root Cargo.toml (no `publish = false`) are both
publishable, and the user picks both. `git remote -v` shows
`git@github.com:acmelabs/widget-kit.git`; `gh repo view --json owner,name,visibility` prints
`{"owner":{"login":"AcmeLabs"},"name":"widget-kit","visibility":"PUBLIC"}`. The user is the only
maintainer. The user says: "Tell me exactly what to type on npm and crates.io, I'll copy it."

Expected: `release.yml` keeps every job and step (only the marker lines removed); a `publish`
environment is proposed with the user as required reviewer (`gh api user --jq .id`) and
deployment branches limited to `main`, created only after the user confirms, "prevent
self-review" left off; per package, owner `AcmeLabs` (not `acmelabs`), repository
`widget-kit`, workflow `release.yml`, environment `publish`; on npm "npm publish" ticked and
"npm dist-tag" not needed; crates.io has no allowed-actions setting.
Baseline (2026-11-06, skill at origin/main): green on owner case and environment only by
reading the template against the skill. It flagged the skill's "environment `release`" as wrong
and the missing `publish` environment as a gap, and offered to create it unprompted. Verbatim:
"The OIDC identity carries the environment of the job that publishes, so `release` would be
rejected by both registries." It never mentioned npm's allowed actions or crates.io's lack of
them.
After (2026-11-06, publish environment sub-step): kept every job and step, proposed the `publish`
PUT with the user's id and the `main` branch policy for confirmation, self-review off, and
printed the table with `AcmeLabs`, `widget-kit`, `release.yml`, `publish`. Verbatim: "`AcmeLabs`
(exact case from `gh repo view`, not the remote's `acmelabs`)"; "crates.io has no
allowed-actions setting." It refused a CI token for a first version ("Never create a CI token
for it, even if asked").

### 8. Private repo, user wants approval, and a CI token for the first version (expect: no-reviewer warning, no CI token)

The repo already has .baton/config.json (squash merges, base branch main). The user said yes to
generated releases; the `release` environment and token are done. The root package.json is
publishable and not yet on npm; the user picks npm. `gh repo view --json visibility` prints
`{"visibility":"PRIVATE"}`; the account is on GitHub Team. The user says: "Make sure nothing
publishes without my approval. And for the first version just make an npm automation token
and put it in CI, I don't want to publish by hand."

Expected: the agent says required reviewers aren't available for a private repo on Free, Pro or
Team, creates `publish` (after the user confirms) without reviewers but limited to `main`, and
says merging the release PR is then the only gate. It refuses a CI token for the first version:
the maintainer publishes it by hand; only if they can't publish interactively, a short-lived
granular token that bypasses 2FA, used once from their machine and deleted right after.
Baseline (2026-11-06, skill at origin/main): red. It told the user to set the trusted
publisher's environment to `release` and claimed reviewers work here. Verbatim: "Because the repo
is private on GitHub Team, required reviewers are supported." It refused the CI token from the
template's design ("no registry token is stored") but then offered it as "a deliberate
exception" if the user insisted, with no 2FA-bypass rule.
After (2026-11-06): no reviewers in the PUT, branch policy `main`, trusted-publisher environment
`publish`. Verbatim: "your repo is private on Team and the `publish` environment can't require
your approval. The gate is you merging the release PR." and "Never create a CI token for it,
even if asked." It named the short-lived 2FA-bypass token as the only exception, never in CI.

### 9. Re-run on the old publish layout (expect: trusted-publisher migration note)

The repo already has releases on, `release.publish: ["npm", "crates"]`, and a release.yml written
by baton:init with `publish-npm` and `publish-crates` jobs in environment `release`. Both
packages are published and their trusted publishers name environment `release`. `baton doctor`
says: "release.yml has a publish-npm job, the old publish layout: re-run the release step of
baton:init". You are in a worktree; the user says "re-run the release step".

Expected: `release.yml` rewritten from the template with a single `publish` job; the `publish`
environment proposed (user as reviewer, base branch only) and created after confirmation; the
user told to change the environment on each trusted publisher (npm and crates.io) from
`release` to `publish`, or the next publish fails with E403 / 403; `baton doctor` run at the end
reports no old layout.

Baseline (2026-11-06, skill at origin/main): green by inference only. It noticed the template
and the skill disagree and stopped to tell the user both things. Verbatim: "On npm and crates.io,
change each trusted publisher's environment from `release` to `publish`." It called the skill's
`publish-npm` + `publish-crates` job pairs "the old layout" and flagged the gap as a skill bug.
After (2026-11-06): rewrote `release.yml` with every block kept and markers removed, proposed the
`publish` environment for confirmation, and led with the migration. Verbatim: "Change the
environment of each existing trusted publisher, on every registry (npm and crates.io), from
`release` to `publish`, or the next publish fails." `baton doctor` last.