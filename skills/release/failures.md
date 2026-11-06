# Release failures

Read by `baton:release` when a release run, a dry run or a registry check fails. Find the row
whose symptom matches the log (`gh run view <run-id> --log-failed`), report the cause and give
its action. Settings in GitHub, npm or crates.io are the maintainer's to change; tell them
exactly what to change and wait. With no matching row, report the log and offer
`gh run rerun <run-id> --failed`.

Re-running `publish` (`gh run rerun <run-id> --failed`) skips registries that already have the
version, and **it waits for approval of the `publish` environment again**. Say so whenever you
offer it, and report the wait as in step 5. Never approve or bypass it yourself.

A dry run that fails, is cancelled, can't be dispatched or never appears blocks the release
PR's merge until a new dry run succeeds.

| Symptom | Cause | Action |
|---|---|---|
| `E403 ... OIDC permission denied` on npm publish | The npm trusted publisher doesn't match, or doesn't allow "npm publish". | The maintainer checks every package's trusted publisher on npmjs.com: owner in exact case (`ExampleOrg`, not `exampleorg`), repository, workflow `release.yml`, environment `publish`, "npm publish" ticked. Then offer `gh run rerun <run-id> --failed`, which waits for approval again. A re-run before the fix fails the same way. |
| npm `ENEEDAUTH`, or 404 on publish of a new package | The package has no trusted publisher yet: this is its first version. | The first-version path from the release step of `baton:init`: the maintainer publishes it by hand from a clean clone of the tag, with their 2FA, then adds the trusted publisher. |
| `EOTP` | A 2FA-protected token was used. | Don't put tokens in CI. A first version is published by hand (row above). |
| crates.io 403 from the auth action | The crate has no trusted publisher, or its fields don't match. | The maintainer fixes the crate's trusted publisher on crates.io: owner in exact case, repository, workflow `release.yml`, environment `publish`. Then offer `gh run rerun <run-id> --failed`, which waits for approval again. |
| `publish` job "Waiting" | Approval of the `publish` environment is pending. | Ask the maintainer to approve it on the run page and keep watching. |
| `publish` job rejected | The maintainer declined the deployment. | Report it. Nothing to re-run until they decide; to publish later, offer `gh run rerun <run-id> --failed`, which waits for approval again. |
| Job cancelled after about 15 minutes, runner "not acquired" | Hosted runner capacity. | Offer `gh run rerun <run-id> --failed`. If that includes `publish`, it waits for approval again. A cancelled dry run is dispatched again instead. |
| Registry 404 right after a successful publish | Propagation delay. | Keep polling every 30 seconds, up to 10 minutes, before reporting the version missing. Don't re-run anything. |
| npm `dist.attestations` empty, and the repo is private | npm only records provenance for packages built from public repos. | Expected: report "no provenance (private repo)", not a failure. In a public repo, an empty value is a failure to report. |
| Version check fails in a build job | Version files were edited by hand. | Fix them in a normal PR, then release the next patch version with a `Release-As` footer (step 3). Never `Release-As` a version that is already tagged. |
| Dry run: `verify-crates` fails with `--locked was passed` or a missing `Cargo.lock` | `Cargo.lock` isn't tracked, so `cargo publish --dry-run --locked` can't use it. | Commit `Cargo.lock` in a normal PR (stack guide: commit lock files), then dispatch the dry run again. Don't merge the release PR until it passes. |
| Dry run dispatch: `HTTP 422: Unexpected inputs provided: ["dry_run"]` | `release.yml` on that branch is the old layout, without the `dry_run` input. | The maintainer re-runs the release step of `baton:init` and merges the new `release.yml` in a normal PR. Don't merge the release PR until a dry run succeeds. |

## Broken release

A published version that turns out broken stays published under that number. **Never re-tag,
move a tag or reuse the version**, and never run `npm deprecate`, `npm unpublish`, `cargo yank`
or any publish yourself, even with credentials on this machine: they need the maintainer's
registry account and every user of the package sees them.

Give the maintainer the commands to run themselves:

```bash
npm deprecate <pkg>@<v> "<reason>; use <next version>"
cargo yank --version <v> <crate>
```

Prefer `npm deprecate` to `npm unpublish`, which only works within 72 hours and when nothing
depends on the version. `cargo yank` is reversible with `--undo`. Then fix the bug in a normal
PR and release a patch version through the release PR.
