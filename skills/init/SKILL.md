---
name: init
description: Use when the user wants to set up the baton workflow in a repository (create .baton/config.json, choose stacks, validation commands and workflow phases, create GitHub labels).
disable-model-invocation: true
---

# Set up baton in this repo

1. **Preconditions:** this is a git repo, `gh auth status` succeeds, and a GitHub remote
   exists (`gh repo view`). If any of these fails, explain what is missing and stop.
2. **Generate the config:** `baton init`. It detects stacks from `package.json` / `Cargo.toml`
   (root and `apps/*`, `packages/*`, `crates/*`, `services/*`) and suggests validation
   commands.
3. **Review it with the user**, one topic at a time. Show the detected values, don't just
   accept them:
   - **stacks**: available ones are `typescript`, `javascript`, `react`, `node`, `rust`,
     `rust-tokio-postgres`. Only enabled stacks load their guides.
   - **validate**: commands that must pass before a PR. Make sure every command really
     exists. Add a `cwd` for monorepo packages, e.g.
     `{ "name": "web-test", "run": "pnpm test", "cwd": "apps/web" }`.
   - **workflow.phases** and gates (`requireSpec`, `requireTdd`, `requireReview`). For a
     project-specific phase, add it to `phases` and point `workflow.custom.<phase>` to an
     instructions file in the repo (e.g. `docs/process/security-audit.md`). Offer to draft that file.
   - **conventions**: project rule files that override stack guides (e.g. `docs/conventions.md`).
   - **git**: base branch, branch prefix, worktree root, merge strategy.
4. **Validate:** `baton config` must print the config without errors.
5. **Labels:** `baton labels` creates the status/priority labels on GitHub. Confirm with the
   user first, since this writes to the remote repo.
6. **Commit** `.baton/config.json` (and the docs dirs) so every contributor and session
   shares the same workflow.

The full schema with defaults is in `${CLAUDE_PLUGIN_ROOT}/templates/config.example.json`.
