# Release failures

Read by `baton:release` when a release run, a dry run or a registry check fails. Find the row
whose symptom matches the log (`gh run view <run-id> --log-failed`), report the cause and give
its action. Settings in GitHub, npm or crates.io are the maintainer's to change; tell them
exactly what to change and wait.

Re-running `publish` (`gh run rerun <run-id> --failed`) skips registries that already have the
version, and **it waits for approval of the `publish` environment again**. Say so whenever you
offer it, and report the wait as in step 5. Never approve or bypass it yourself.

| Symptom | Cause | Action |
|---|---|---|
| `E403 ... OIDC permission denied` on npm publish | The npm trusted publisher doesn't match, or doesn't allow "npm publish". | The maintainer checks every package's trusted publisher on npmjs.com: owner in exact case (`ExampleOrg`, not `exampleorg`), repository, workflow `release.yml`, environment `publish`, "npm publish" ticked. Then re-run failed jobs, which waits for approval again. A re-run before the fix fails the same way. |
| npm `ENEEDAUTH`, or 404 on publish of a new package | The package has no trusted publisher yet: this is its first version. | The first-version path from the release step of `baton:init`: the maintainer publishes it by hand from a clean clone of the tag, with their 2FA, then adds the trusted publisher. |
| `EOTP` | A 2FA-protected token was used. | Don't put tokens in CI. A first version is published by hand (row above). |
| crates.io 403 from the auth action | The crate has no trusted publisher, or its fields don't match. | The maintainer fixes the crate's trusted publisher on crates.io: owner in exact case, repository, workflow `release.yml`, environment `publish`. Then re-run failed jobs, which waits for approval again. |
| `publish` job "Waiting" | Approval of the `publish` environment is pending. | Ask the maintainer to approve it on the run page and keep watching. |
| `publish` job rejected | The maintainer declined the deployment. | Report it. Nothing to re-run until they decide; publishing later means re-running `publish` and approving it again. |
| Job cancelled after about 15 minutes, runner "not acquired" | Hosted runner capacity. | Re-run failed jobs. If that includes `publish`, it waits for approval again. |
| Registry 404 right after a successful publish | Propagation delay. | Keep polling every 30 seconds, up to 10 minutes, before reporting the version missing. Don't re-run anything. |
| Version check fails in a build job | Version files were edited by hand. | Fix them in a normal PR, then release with a `Release-As` footer (step 3). |
| Dry run: `verify-crates` fails with `--locked was passed` or a missing `Cargo.lock` | `Cargo.lock` isn't tracked, so `cargo publish --dry-run --locked` can't use it. | Commit `Cargo.lock` in a normal PR (stack guide: commit lock files), then dispatch the dry run again. Don't merge the release PR until it passes. |

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
