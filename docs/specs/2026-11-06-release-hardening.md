# Release hardening — Spec

- Status: approved
- Date: 2026-11-06
- Owner: Arnold Gandarillas
- Related: amends [release phase](2026-10-28-release-phase.md) (publish jobs, init setup,
  `baton:release`); [ADR-0001](../adr/0001-generated-changelog.md). Lessons from the first
  crates.io + npm releases of a baton repo (minuta). Packages that ship platform binaries are a
  separate, later spec.

## TL;DR
- Publishing waits for one human approval per release: a single `publish` job runs in a new
  `publish` environment with required reviewers. The `release` environment keeps only the
  release-please token, so ordinary merges never wait for approval.
- That one job checks every package before publishing any, then publishes npm first and the
  crate last.
- `workflow_dispatch` gets a `dry_run` input. `baton:release` runs it before merging a release PR
  when `release.yml` changed since the last release.
- `baton:init` gives an exact trusted-publisher checklist per registry. `baton:release` gains a
  failure catalogue, registry checks that wait out propagation and check provenance, and
  rollback guidance that leaves every registry action to the maintainer.

## Change in a nutshell
Merging a release PR today publishes immediately, in two independent jobs:

```text
release-please -> build-npm -> publish-npm      [env: release]
               -> verify-crates -> publish-crates [env: release]
```

After this change:

```text
release-please [env: release, token]
  -> build-npm, verify-crates            (no credentials)
  -> publish [env: publish, required reviewer]
       check all -> npm publish -> cargo publish
```

The maintainer merges the release PR, GitHub asks them to approve the `publish` deployment, and
one approval publishes to every registry, in order. A crate that fails its checks no longer
leaves npm published, and a release can't go out without a second, deliberate click.

## Problem
In the first real release of a baton repo publishing to crates.io and npm, three things hurt.
The publish jobs ran on merge with no approval step, so the merge was the only gate. The two
registries published independently, so one could succeed while the other failed its checks.
And most of the time went into registry setup errors (`E403 ... OIDC permission denied` because
"Allow npm publish" wasn't ticked, owner-name case, `EOTP` for a first publish) that baton's
init steps and release skill didn't mention, plus false alarms from checking a registry seconds
after publishing.

## Goals / Success criteria
- A release that publishes waits for one approval of the `publish` environment and then
  publishes to every configured registry; ordinary merges to the base branch never wait.
- No registry is published to unless every configured package passed its checks in that run.
- npm is published before crates.io in the same job; a failed npm publish means no crate publish
  in that attempt, and "Re-run failed jobs" finishes the release by skipping what is already
  published.
- A dispatched run with `dry_run: true` builds and checks every package and runs the registries'
  dry-run publish, uses no token and no id-token, needs no approval, and creates no tag, Release
  or release PR change.
- `baton:release` runs that dry run before merging when `release.yml` changed since the last
  tag, and reports its result.
- `baton:init` lists every trusted-publisher field per registry and package, with exact values.
- `baton:release` recognises each catalogued failure by its symptom and gives the action.
- After a release, `baton:release` confirms each registry has the version (waiting up to 10
  minutes), each npm package has a provenance attestation, and each npm package with a `bin`
  runs `--version` from a clean install.

## Non-goals
- Platform binary packages, build matrices, static-link checks and multi-arch install tests
  (the later spec).
- npm staged publishing (`npm stage publish` plus 2FA approval). Revisit once this flow is proven.
- A tag-triggered publish workflow (considered; see FAQ).
- Storing any registry token in CI, including for a first publish.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Agent | Run the dry run; read runs, jobs and registries; report a pending approval; offer "Re-run failed jobs" when asked; draft a versioning policy; give the maintainer the exact `npm deprecate` / `cargo yank` command | Approve the `publish` deployment; change environment or ruleset settings without the user confirming; run `npm deprecate`, `npm unpublish`, `cargo yank` or any publish; hold registry credentials |
| Maintainer | Approve or reject the `publish` deployment; configure environments, reviewers, rulesets and trusted publishers; deprecate or yank a version | Publish from their machine, except a package's first version |

## Tenancy & localization
n/a

## Domain model
- **`publish` environment:** required reviewers (up to six users or teams; one approval is
  enough), deployment branches limited to the base branch, no secrets. "Prevent self-review" is
  off by default, because a solo maintainer both merges and approves; init suggests it when the
  repo has more than one maintainer.
- **`release` environment:** unchanged. Holds `RELEASE_PLEASE_TOKEN`, limited to the base
  branch, no reviewers.
- **Dry run:** a `workflow_dispatch` run with `dry_run: true`. It proves the workflow parses,
  the packages build, versions match the manifest and the registries accept the package
  contents. It does not prove OIDC, trusted-publisher settings, real registry state or Release
  creation.

## Interfaces
**`templates/release/release.yml`**
- `on.workflow_dispatch.inputs.dry_run`: boolean, default `false`.
- `release-please`: skipped when `inputs.dry_run` is true; otherwise unchanged.
- `build-npm`, `verify-crates`: run when a release was created, or on a dry run. On a dry run
  they check out the dispatched commit and check the package version against the manifest
  version (no tag exists); otherwise unchanged (release `sha`, version equals tag).
  `verify-crates` also runs `cargo publish --dry-run --locked` on a dry run.
- `dry-run-npm` (only when npm is configured): on a dry run only, `permissions: { contents:
  read }`, no environment, no id-token; downloads the tarball, runs the same tarball checks as
  the publish job, then `npm publish <file>.tgz --dry-run --ignore-scripts`.
- `publish` (replaces `publish-npm` and `publish-crates`): `needs` every build and verify job,
  runs only when a release was created and every one of them succeeded, `permissions:
  { contents: read, id-token: write }`, `environment: publish`. Steps, each marked for
  `baton:init` to keep per `release.publish`:
  1. check every configured package (the existing tarball name, package name and version checks
     for npm; the version check for crates) before publishing any;
  2. npm: the existing npm version check, registry skip check and
     `npm publish <file>.tgz --ignore-scripts`;
  3. crates: the existing registry skip check, `crates-io-auth-action` and
     `cargo publish --no-verify`.
  No expression is expanded inside a `run:` script, as today.
- Trusted publishers name workflow `release.yml` and environment `publish`.

**`baton:init` (release step)**
- Creates (after the user confirms) the `publish` environment with the user as required
  reviewer, limited to the base branch, alongside `release`.
- Checks repo visibility (`gh repo view --json visibility`). Required reviewers need a public
  repo on Free, Pro or Team plans; for a private repo it says so, creates `publish` without
  reviewers, and states that merging the release PR is then the only gate.
- Prints a checklist per configured package:

  | Field | Value |
  |---|---|
  | Owner | the GitHub owner, exact case (`JCIOriente`, not `jcioriente`) |
  | Repository | the repo name |
  | Workflow | `release.yml` |
  | Environment | `publish` |
  | npm allowed actions | "npm publish" ticked; "npm dist-tag" not needed |

- First version of a new package: unchanged (clean clone of the tag, publish by hand from the
  maintainer's machine with their 2FA). Adds: never create a CI token for it; a granular token
  that bypasses 2FA is only for maintainers who can't publish interactively, is short-lived,
  and is deleted right after.
- Tag ruleset (existing suggestion, extended): besides blocking update and deletion of `v*`, it
  may restrict creation to bypass actors; the owner of `RELEASE_PLEASE_TOKEN` must then be a
  bypass actor, or release-please can't tag.

**`baton:release`**
- Step 2 adds: if `git diff v<last>..origin/<base> -- .github/workflows/release.yml` is non-empty
  and `release.publish` is set, dispatch `gh workflow run release.yml -f dry_run=true`, wait for
  the run created after the dispatch, and report it; a failed dry run blocks the merge.
- Step 2 adds: if the release PR's version is `1.0.0` or a new major version, ask whether a
  versioning and stability policy is written down (an ADR, or the file the maintainer names).
  If not, offer to draft one from the code for the maintainer to decide on, and don't merge
  until they confirm.
- Step 5 adds: if the `publish` job is waiting for approval, tell the user to approve it in
  the run page and keep watching; never try to approve or bypass it. Registry checks poll every
  30 seconds for up to 10 minutes before reporting a version missing. For npm:
  `npm view <pkg>@<v> dist.attestations --json` must be non-empty, and for a package with
  `bin`, `npm exec --yes --package=<pkg>@<v> -- <bin> --version` in an empty temp directory
  must print `<v>`.
- A failure catalogue in `skills/release/failures.md`, read when a run or check fails:

  | Symptom | Cause | Action |
  |---|---|---|
  | `E403 ... OIDC permission denied` on npm publish | trusted publisher mismatch (owner case, repo, workflow, environment) or "npm publish" not allowed | maintainer fixes the npm settings for every package; then re-run failed jobs |
  | npm `ENEEDAUTH`, or 404 on publish of a new package | package has no trusted publisher yet (first version) | first-version path from init |
  | `EOTP` | a 2FA-protected token was used | don't use tokens in CI; first version by hand |
  | crates.io 403 from the auth action | crate has no trusted publisher, or fields mismatch | maintainer fixes crates.io settings; re-run failed jobs |
  | `publish` job "Waiting" | approval pending | ask the maintainer to approve |
  | `publish` job rejected | maintainer declined | report; nothing to re-run until they decide |
  | job cancelled after ~15 min, runner "not acquired" | hosted runner capacity | re-run failed jobs |
  | registry 404 right after a successful publish | propagation delay | keep polling up to 10 minutes |
  | version check fails in a build job | version files edited by hand | fix in a PR, release with `Release-As` |

- A "Broken release" section: never re-tag or reuse a version. Give the maintainer the command
  to run themselves: `npm deprecate <pkg>@<v> "<reason>"` (prefer it to `npm unpublish`, which
  only works within 72 hours and without dependents) and `cargo yank --version <v> <crate>`
  (reversible with `--undo`). Then fix in a normal PR and release a patch.

**`baton doctor`**: when `release.publish` is set and `release.yml` still has `publish-npm` or
`publish-crates` jobs, or a publish job not in the `publish` environment, report "re-run the
release step of baton:init".

## Behavior & edge cases
- **No publish targets** (`publish: []`, like baton itself): no build, dry-run or publish jobs.
  A dry run then does nothing beyond skipping release-please; `baton:release` doesn't dispatch
  one.
- **Approval never given:** the `publish` job stays pending, and the tag and Release already
  exist. Approving it, or re-running the job and approving, publishes; nothing is re-tagged.
- **Approval rejected:** the `publish` job fails. To publish later, re-run it and approve.
- **npm fails, crate not yet published:** re-run failed jobs; npm is skipped if it got through,
  then the crate publishes.
- **Dry run on a commit whose manifest version is already released:** fine; it checks contents,
  not registry state.
- **Dry run while a release PR merge is in flight:** the shared `release` concurrency group
  queues it, as today.
- **Existing adopters on the old layout:** keep working until they re-run the init release step.
  Re-running it rewrites `release.yml`; the maintainer must then create `publish` and change the
  environment on each trusted publisher from `release` to `publish`, or the next publish fails
  with the E403 row above.
- **Private repo without reviewers:** `publish` still runs in its own environment, so trusted
  publishers stay bound to it; init says there is no approval step.

## Data & migrations
Template-only for adopters; nothing changes until they re-run the init release step. baton
itself has `publish: []`, so its `release.yml` gains only the `dry_run` input and the skip on
`release-please`.

## Testing strategy
- Templates (`cli/test/release-templates.test.mjs`): the `dry_run` input exists and defaults to
  false; `release-please` is skipped on a dry run; a single `publish` job needs every build and
  verify job, is gated on `release_created` and their success, is the only job with
  `id-token: write` and the only one in environment `publish`; within it every check step
  precedes every publish step, and the npm publish step precedes the crates publish step;
  `dry-run-npm` and the dry-run path have no id-token and no environment; `verify-crates` runs
  `cargo publish --dry-run` only on a dry run; existing pins, injection and version checks still
  hold. actionlint passes.
- `baton doctor`: reports the old layout.
- Skill (`tests/skills/release.md`, red/green): `publish` waiting for approval (tell the
  maintainer, don't bypass); E403 on npm (name the trusted-publisher fields, maintainer fixes,
  offer re-run); registry 404 seconds after publishing (poll, don't report failure);
  `release.yml` changed since the last tag (dry run before merge); a broken release (give
  deprecate/yank commands, don't run them, patch release); release PR proposing `1.0.0`
  (policy before merge).
- Init (`tests/skills/init.md`): the checklist lists exact owner case and environment `publish`;
  a private repo gets the no-reviewer warning.
- Live: the next minuta release through the new template, with one approval publishing npm then
  crates.io.

## Decisions
- One `publish` job rather than one per registry: GitHub asks for approval per job that reaches
  a protected environment, so separate jobs that start at different times could each need an
  approval, and a single job is what makes the npm-then-crates order a guarantee.
- Publish jobs stay in `release.yml`, triggered by the merge (see FAQ).
- `CONTEXT.md`: adds Publish environment and Dry run.

## FAQ
### Why not trigger publishing from the tag in a separate workflow, as minuta does?
It would bind trusted publishers to a second workflow file and rely on the PAT-created tag
triggering it, for no extra safety: the release PR merge is already the human decision, the
`publish` approval is the second one, and the tag ruleset already protects `v*` tags. Keeping
one workflow is the smaller change for existing adopters.

### Why does the dry run need no approval?
It runs no job with credentials or id-token, so there is nothing to approve. It can't publish.

### Why npm before crates.io?
An npm package can be deprecated and a fixed version published within minutes; a crates.io
version is permanent (only yanked). Publishing the reversible registry first means a failure in
it stops before the permanent one.

### Why does the agent never run `npm deprecate` or `cargo yank`?
They need the maintainer's registry credentials, which agents don't hold, and they are visible to
every user of the package. The agent gives the exact command for the maintainer to run.

## Open questions
None. Resolved before approval:
- GitHub's docs don't state when a deployment waiting for approval expires, so the skill makes no
  claim about it: a waiting `publish` job is approved, rejected or left pending by the maintainer.
- crates.io trusted publishers take owner, repository, workflow file and an optional environment,
  and have no allowed-actions setting (rust-lang/rfcs 3691). The checklist's "npm allowed
  actions" row applies to npm only.

## Implementation status
- [ ] Plan
