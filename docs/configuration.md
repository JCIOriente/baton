# Configuration

Each project describes its workflow in `.baton/config.json`. `/baton:init` writes it with you;
anything left out falls back to the defaults. See
[`templates/config.example.json`](../templates/config.example.json) for a full example.

## Key fields

- `stacks`: which guides and reviewers apply
- `setup`: `[{ name, run, cwd? }]`, run in every new task worktree (e.g. dependency install)
- `validate`: `[{ name, run, cwd?, gates?, stages?, blocking?, reason? }]`, the project's
  checks. `gates` names the catalog gates a step covers. `stages` picks where it runs: `commit`
  (the pre-commit hook), `local` (`baton verify`) and `ci` (`baton verify --stage ci`); the
  default is `local` and `ci`. Every blocking step must pass before `baton done` opens a PR. A
  step with `blocking: false` needs a `reason`; when it fails, the failure is reported and the
  run goes on. The PR body uses [`templates/pr-body.md`](../templates/pr-body.md): at most two
  paragraphs, plus a `Validated:` line
- `gates.skip`: `{ "<gate>": "<reason>" }`, catalog gates this repo deliberately doesn't run
- `workflow.phases`: reorder or drop built-in phases, or add your own with
  `workflow.custom: { "<phase>": "docs/process/<phase>.md" }`
- `workflow.requireSpec | requireTdd | requireReview | baselineOnStart`: the gates
- `review.scopeToDiff`: off by default (every stack reviewer runs). When on, a stack reviewer is
  skipped only when the diff provably doesn't touch its stack
- `hooks.factGate`: opt-in investigate-before-edit gate
- `hooks.worktreeOnly`: on by default; every change happens in a linked worktree (see
  [Worktree guard](architecture.md#worktree-guard-on-by-default)). `false` turns both guards off
- `conventions`: project rule files that override the stack guides

## Stacks and guides

`typescript`, `javascript`, `react`, `node`, `rust`, `rust-tokio-postgres`, `postgres`,
`api`, `openapi`, `i18n`, `e2e`, plus the always-on `common` baseline.

## Releases

Releases and publishing are opt-in. The release step of `baton:init` turns them on: it sets
`release.enabled` and `release.publish` in `.baton/config.json` and writes the release-please
files and workflow. When enabled, release-please maintains a release PR with the next version
(from the merged PR titles) and the generated changelog. Merging that PR tags `vX.Y.Z`
(e.g. `v0.2.0`, no package name), and CI publishes that version to the configured registries.
`baton:release` merges the release PR when you ask. See the
[release phase spec](specs/2026-10-28-release-phase.md).

## CLI

`baton help` lists every command. Read commands accept `--json`.
