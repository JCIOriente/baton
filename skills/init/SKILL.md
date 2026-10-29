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
        If the latest tag (`git describe --tags --abbrev=0`) isn't `v<version>`, add a
        top-level `"last-release-sha"` with that release's commit (`git rev-list -n 1 <tag>`);
        otherwise release-please lists every past commit.
      - `.release-please-manifest.json`: `{ ".": "<version>" }`.
      - `.github/workflows/release.yml`: replace `main` with `git.baseBranch`.
   4. If `CHANGELOG.md` has a `## Unreleased` section, match each entry to the commits since
      the last tag (`git log <tag>..HEAD`). For an entry no `feat` or `fix` commit covers,
      propose adding this to the source PR's body, and edit it only after the user confirms:
      ```text
      BEGIN_COMMIT_OVERRIDE
      <feat or fix>(<scope>): <the entry>
      END_COMMIT_OVERRIDE
      ```
      Then remove the section. Keep the header and older sections; release-please adds new
      versions above them. Never create `CHANGELOG.md`; release-please does on the first release.
   5. Tell the user the token steps: create a fine-grained personal access token for this repo
      only, with Contents, Pull requests and Issues set to read and write, and save it as the
      repo secret `RELEASE_PLEASE_TOKEN` (`gh secret set RELEASE_PLEASE_TOKEN`). It expires, so
      note the date. The release PR's author is the token owner, so once approvals are
      required, another maintainer approves it.
   6. Suggest, and run only after the user confirms, protecting tags and releases:
      ```bash
      gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'JSON'
      { "name": "release tags", "target": "tag", "enforcement": "active",
        "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
        "rules": [ { "type": "update", "parameters": { "update_allows_fetch_and_merge": false } },
                   { "type": "deletion" } ] }
      JSON
      gh api -X PUT repos/{owner}/{repo}/immutable-releases
      ```
   7. Run `baton doctor`; it must report no release mismatch.

   To turn releases on later, or after a config change, run step 1 and then this step on its
   own in a repo that already has `.baton/config.json`. Skip `baton init`, which refuses when a
   config exists.
   Rewrite the three files from the templates and the current config.
9. **Commit** `.baton/config.json` (and the docs dirs) so every contributor and session
   shares the same workflow.

The full schema with defaults is in `${CLAUDE_PLUGIN_ROOT}/templates/config.example.json`.
