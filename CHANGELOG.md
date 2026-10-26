# Changelog

All notable changes. Versions follow [semver](https://semver.org); before 1.0, minor versions
may change behavior.

## Unreleased

- `baton:spec` and `baton:retro` write an ADR only for a choice later specs must follow. A choice
  that is hard to reverse but local to one spec keeps its reasoning in the spec FAQ.
- Moved to [JCIOriente/baton](https://github.com/JCIOriente/baton) and renamed the marketplace
  from `veloud` to `jcioriente`. Existing installs: `claude plugin marketplace add JCIOriente/baton`,
  then `claude plugin install baton@jcioriente` (and uninstall `baton@veloud`).

## 0.1.0 — 2026-10-22

First public release.

- Workflow skills: workflow, init, spec, plan, backlog, implement, verify, review, integrate,
  parallel, debug, retro.
- `baton` CLI: race-safe claims on GitHub Issues, one worktree per task with setup and a baseline
  run, project-defined validation, reviewer selection, PR creation with a review gate, `doctor`
  and `upstream` drift checks.
- Opt-in stack guides (TypeScript, JavaScript, React, Node, Rust, tokio-postgres, Postgres, API,
  OpenAPI, i18n, E2E) and reviewer briefs.
- Hooks: session context, optional fact gate.
