---
name: init
description: Use when the user wants to set up or reconfigure the baton workflow in a repository.
disable-model-invocation: true
---

# Set up baton in this repo

1. **Preconditions:** this is a git repo, `gh auth status` succeeds, and a GitHub remote
   exists (`gh repo view`). If any of these fails, explain what is missing and stop.
2. **Generate the config:** `baton init`. It detects stacks from `package.json`, `Cargo.toml`
   and OpenAPI files (root and `apps/*`, `packages/*`, `crates/*`, `services/*`), and suggests
   setup and validation commands.
3. **Review it with the user**, one topic at a time. Show the detected values, don't just
   accept them:
   - **stacks**: `typescript`, `javascript`, `react`, `node`, `rust`, `rust-tokio-postgres`,
     `postgres`, `api`, `openapi`, `i18n`, `e2e`. Only enabled guides and reviewers load. The
     `common` baseline always loads.
   - **setup**: commands for every new task worktree, e.g. dependency install. Add a `cwd` for
     monorepo packages.
   - **validate**: commands that must pass before a PR, in order, fastest first. Make sure every
     command really exists. Add a `cwd` for packages:
     `{ "name": "web-test", "run": "pnpm test", "cwd": "apps/web" }`. The suggested `secrets`
     step needs [gitleaks](https://github.com/gitleaks/gitleaks). For a public repo, keep it.
     **Keep local and CI checks identical** by giving them one entry point: put the checks in a
     single script (`make ci`, `just ci` or a `ci` package script), have `validate` run that
     script, and have the CI workflow run the same script. Two separate lists drift apart.
     Modules that others depend on can add their own downstream checks here.
   - **workflow**: phases and gates (`requireSpec`, `requireTdd`, `requireReview`,
     `baselineOnStart`). For a project-specific phase, add it to `phases` and point
     `workflow.custom.<phase>` to an instructions file in the repo (e.g.
     `docs/process/security-audit.md`). Offer to draft that file.
   - **review.scopeToDiff**: off by default, so every enabled stack's reviewer runs on every
     change. Turning it on skips a stack reviewer only when the diff provably doesn't touch that
     stack. Leave it off unless review cost becomes a problem.
   - **hooks.factGate**: opt-in. Before the first edit of each file in a session, the agent must
     state facts (importers, affected API, the user's instruction). It improves care on large
     codebases, but adds one round trip per file.
   - **conventions**: project rule files that override the guides (e.g. `docs/conventions.md`).
     Offer to create it. `baton:retro` adds lessons to it over time.
   - **git**: base branch, branch prefix, worktree root, merge strategy.
   - **release.enabled**: opt-in, off by default. Generated versions, CHANGELOG and releases.
     Step 8 sets it up; leave it `false` here.
4. **Validate:** `baton config` must print the config without errors, and `baton doctor` reports
   missing tools, stacks not enabled, and dependency versions older than the guides assume.
5. **Labels:** `baton labels` creates the status/priority labels on GitHub. Confirm with the
   user first, since this writes to the remote repo.
6. **Protect the base branch** (suggest; run only after the user confirms). It is enforced by
   GitHub, so no agent or local hook can skip it: require a pull request, require the CI checks
   that run the same commands as `validate`, and block force-pushes and deletion. For example:
   ```bash
   gh api -X PUT repos/{owner}/{repo}/branches/<baseBranch>/protection --input - <<'JSON'
   { "required_status_checks": { "strict": true, "contexts": ["<ci check name>"] },
     "enforce_admins": true,
     "required_pull_request_reviews": { "required_approving_review_count": 0 },
     "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
   JSON
   ```
   Raise `required_approving_review_count` to 1 once the project has a second maintainer.
7. **Squash commit message** (when `git.mergeStrategy` is `squash`; suggest, run only after the
   user confirms). GitHub's default squash message stacks every commit message and trailer in
   the PR. Use the PR title and body instead, so the commit on the base branch is the
   Conventional Commit title plus the short PR body:
   ```bash
   gh api -X PATCH repos/{owner}/{repo} -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
   ```
8. **Releases** (only when `git.mergeStrategy` is `squash`). Ask whether the project wants
   generated releases: release-please keeps a release PR open, and merging it bumps the version,
   updates `CHANGELOG.md`, tags `v<version>` and creates the GitHub Release. The trade-off:
   versions and notes come from PR titles, and it needs a token only a maintainer can create.
   **Default no.** On no, leave `release.enabled: false` and write nothing. On yes:
   1. Set `release.enabled: true` in `.baton/config.json`.
   2. Read the current version: root `package.json` (`release-type: node`), else root
      `Cargo.toml` (`rust`), else `version.txt` (`simple`, which keeps the version there). With
      none, use `0.0.0`.
   3. Write the three files from `${CLAUDE_PLUGIN_ROOT}/templates/release/`:
      - `release-please-config.json`: set `release-type`. List other files that carry the
        version in `extra-files`, e.g.
        `{ "type": "json", "path": ".claude-plugin/plugin.json", "jsonpath": "$.version" }`.
        Set `"last-release-sha"` (top level) to the last release's commit when release-please
        can't find it from a `v<version>` tag, or it lists every past commit:
        - latest tag (`git describe --tags --abbrev=0`) isn't `v<version>`: its commit
          (`git rev-list -n 1 <tag>`);
        - no tags and the version isn't `0.0.0`: the commit that set the current version,
          confirmed with the user. Find it with
          `git log -1 --format=%H -S'"version": "<version>"' -- package.json`
          (`-S'version = "<version>"' -- Cargo.toml`, or `git log -1 --format=%H -- version.txt`).
          Never default to `HEAD` while `## Unreleased` has entries: release-please ignores
          commits at or before `last-release-sha`, so those entries would be lost;
        - no tags and `0.0.0`: leave it out.
      - `.release-please-manifest.json`: `{ ".": "<version>" }`.
      - `.github/workflows/release.yml`: replace `<base-branch>` with `git.baseBranch`. If the
        file exists and lacks the "Written by baton:init" header, show it and ask before
        replacing it.
   4. If `CHANGELOG.md` has a `## Unreleased` section, match each entry to the commits since
      the last release (`git log <last release commit>..HEAD`, or `git log HEAD` for `0.0.0`).
      For each entry no `feat` or `fix` commit covers, propose an override on its source PR's
      body, and edit the body only after the user confirms. Check first that the PR's merge
      commit comes after the last release commit
      (`git merge-base --is-ancestor <last release commit> <merge commit>` and not equal to it);
      release-please never reads an older PR, so its entry can't be kept this way:
      ```text
      BEGIN_COMMIT_OVERRIDE
      <feat or fix>(<scope>): <the entry>
      END_COMMIT_OVERRIDE
      ```
      The block replaces that PR's commit message, so keep the PR's own line in it if it had
      one. An entry with no source PR goes as an extra line in another PR's block, or ask the
      user what to do with it.
      **Remove `## Unreleased` only once every uncovered entry has a confirmed override on a PR
      after the last release.**
      Otherwise keep the section and list the entries the generated notes would lose. Keep the
      header and older sections; release-please adds new versions above them. Never create
      `CHANGELOG.md`; release-please does on the first release.
   5. The token lives in a `release` environment limited to the base branch, so a workflow on
      another branch can't read it. **The environment must exist with that branch policy before
      the token is saved.** Offer to create it, and run only after the user confirms (on a
      re-run, skip the POST if `gh api repos/{owner}/{repo}/environments/release/deployment-branch-policies`
      already lists the base branch):
      ```bash
      gh api -X PUT repos/{owner}/{repo}/environments/release --input - <<'JSON'
      { "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
      JSON
      gh api -X POST repos/{owner}/{repo}/environments/release/deployment-branch-policies -f name=<baseBranch>
      ```
      If the user declines or a call fails (e.g. 403), tell them to create it in Settings >
      Environments: name `release`, deployment branches "Selected branches" with
      `git.baseBranch`. Never fall back to a repo secret, and don't let the first workflow run
      create the environment, since that one has no branch limit.
      Then tell the user to create a fine-grained personal access token: Repository access
      "Only select repositories" with this repo; permissions Contents, Pull requests and Issues
      set to read and write (Metadata read is added automatically); and an expiry. Save it with
      `gh secret set RELEASE_PLEASE_TOKEN --env release`. Note the expiry date. The release
      PR's author is the token owner, so once approvals are required, another maintainer
      approves it.
   6. **Publishing.** Ask whether to publish packages from the release tag. Offer only what
      the repo can publish: `npm` for a root `package.json` without a truthy `private`,
      `crates` for a root `Cargo.toml` without `publish = false`. If the user asks for a target
      that isn't offered, say why. **Default none.** Set `release.publish` to the answer
      (`[]`, `["npm"]`, `["crates"]` or both). In `.github/workflows/release.yml`, keep only
      the job pairs marked for the chosen targets (`build-npm` + `publish-npm`, `verify-crates`
      + `publish-crates`). Delete each other job with the `# baton:init: keep ...` marker line
      above it, and delete the marker lines of the kept jobs. The build and verify jobs run
      dependency and build code without credentials; the publish jobs hold the registry login
      and only publish what they built. Keep the file header ("Written by baton:init"). Keep the "Publish jobs"
      comment when a job stays, drop it when none does. Then tell the user, per target:
      - `build-npm` installs with `npm ci` only when `package-lock.json` exists, then runs
        `npm run build --if-present` and `npm pack`. A repo using pnpm, yarn or bun must adapt
        the install step.
      - On the registry, add a trusted publisher: this repo, workflow `release.yml`,
        environment `release`. No registry token is stored.
      - A package not yet on the registry: the first release still happens, and its publish
        job fails because no trusted publisher exists yet. The registry only accepts one for a
        package that exists, so the maintainer clones that release's tag into a clean directory
        (`git clone --depth 1 --branch v<version> <repo-url> <tmp dir>`), reviews
        `npm pack --dry-run` / `cargo package --list`, publishes that version by hand, then
        adds the trusted publisher. CI publishes every
        later version; a re-run skips a version already on the registry. Agents never tag or
        publish.
      - After the first CI publish, revoke any old registry tokens.
      - Add `npm publish --dry-run` / `cargo publish --dry-run` to the repo's CI script
        on a fresh checkout, before any build step, so a package that can't publish or a missing
        build fails before the release.
   7. Suggest, and run only after the user confirms, protecting tags and releases. Skip the
      ruleset if `gh api repos/{owner}/{repo}/rulesets --jq '.[] | select(.name=="release tags")'`
      prints one:
      ```bash
      gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'JSON'
      { "name": "release tags", "target": "tag", "enforcement": "active",
        "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
        "rules": [ { "type": "update", "parameters": { "update_allows_fetch_and_merge": false } },
                   { "type": "deletion" } ] }
      JSON
      gh api -X PUT repos/{owner}/{repo}/immutable-releases
      ```
   8. Run `baton doctor`; it must report no release mismatch.

   To turn releases on later, or after a config change, run step 1 (preconditions) and then
   all of step 8, skipping `baton init` (it refuses when a config exists). Step 8 rewrites the
   three files from the templates and the current config.
9. **Commit** `.baton/config.json` (and the docs dirs) so every contributor and session
   shares the same workflow.

The full schema with defaults is in `${CLAUDE_PLUGIN_ROOT}/templates/config.example.json`.
