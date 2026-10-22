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
     Modules that others depend on can add their own downstream checks here.
   - **workflow**: phases and gates (`requireSpec`, `requireTdd`, `requireReview`,
     `baselineOnStart`). For a project-specific phase, add it to `phases` and point
     `workflow.custom.<phase>` to an instructions file in the repo (e.g.
     `docs/process/security-audit.md`). Offer to draft that file.
   - **hooks.factGate**: opt-in. Before the first edit of each file in a session, the agent must
     state facts (importers, affected API, the user's instruction). It improves care on large
     codebases, but adds one round trip per file.
   - **conventions**: project rule files that override the guides (e.g. `docs/conventions.md`).
     Offer to create it. `baton:retro` adds lessons to it over time.
   - **git**: base branch, branch prefix, worktree root, merge strategy.
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
7. **Commit** `.baton/config.json` (and the docs dirs) so every contributor and session
   shares the same workflow.

The full schema with defaults is in `${CLAUDE_PLUGIN_ROOT}/templates/config.example.json`.
