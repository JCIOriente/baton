# baton

A Claude Code plugin with one opinionated, configurable workflow for humans and AI agents
working on the same codebase:

```
spec -> plan -> backlog -> implement -> verify -> review -> integrate (-> retro)
```

A task is like a baton: exactly one holder at a time, handed off explicitly. The plugin has
no unrelated skills and no connectors. Stack guides and reviewers load only in repos that
enable them.

## Install

```bash
claude plugin marketplace add JCIOriente/baton
claude plugin install baton@jcioriente
```

Pin a release for a project by installing from a tag (see [CHANGELOG](CHANGELOG.md)).

Requirements: Node >= 20, `git`, and `gh` (authenticated) for backlog commands. The suggested
`secrets` validation step uses [gitleaks](https://github.com/gitleaks/gitleaks).

## Use in a project

```
/baton:init                 # .baton/config.json: detects stacks, reviews setup/validation/gates with you
/baton:spec <topic>         # idea -> approved spec (+ ADRs, CONTEXT.md glossary)
/baton:plan                 # spec -> parallelizable tasks with file ownership, contract and impact
/baton:backlog              # plan -> GitHub issues with deps and priorities
/baton:implement 42         # claim #42, isolated worktree, setup + baseline, test-first
/baton:verify               # project validation, evidence before claims
/baton:review               # spec compliance gate, then parallel per-angle reviewers
/baton:integrate            # rebase, re-verify, PR, merge per policy, unblock, retro
/baton:parallel             # controller for several tasks at once (implementer subagents)
/baton:debug                # root cause before fixes
/baton:retro                # lessons -> conventions/ADRs via reviewed PRs
```

`baton:workflow` is the router. When a session starts in a configured repo, a hook tells
Claude to load it, along with the repo's phases, gates, guide paths and validation commands.

## Architecture

| Concern | Where it lives |
|---|---|
| Shared task state (ownership, status, deps, history) | GitHub Issues: labels, assignees, `Depends on: #N`, claim marker comments |
| Local execution | One git worktree + branch per task (`../<repo>-worktrees/task-<n>-<slug>`), `setup` and a baseline run on start. No shared mutable local files |
| Integration | `baton verify` (project-defined commands) -> review (spec compliance, then quality angles) -> `baton done` (PR `Closes #N`) -> merge policy |
| Learning | `baton:retro` turns review and verification evidence into convention/ADR changes, reviewed like code. Nothing is learned privately |
| Workflow definition | `.baton/config.json` in each project, falling back to defaults |
| Judgment (when and why) | `skills/*/SKILL.md` |
| Mechanics (how, the same way every time) | `baton` CLI (`cli/`, zero dependencies, on PATH via `bin/`) |
| Coding rules | `stacks/*.md`, opt-in per project. `common.md` always applies |
| Review angles | `reviewers/*.md`, chosen by `baton reviewers` from the enabled stacks |

**Claims:** GitHub has no atomic compare-and-set, so `baton claim` posts a marker comment,
re-reads the thread, and the earliest claim since the last release wins. The loser rolls
back automatically. Markers count only when the comment author matches the claimed user.

**Fact gate (opt-in):** with `hooks.factGate`, the first edit of each file per session is
refused once, until the agent states facts about it: importers, affected API, data, and the
user's instruction. It's adapted from ECC's gateguard.

**Cross-tool:** all state and logic live in the CLI and in plain markdown, so a
Codex/other-agent adapter only has to generate an `AGENTS.md` that points to the same skills and
`baton` commands. Not built yet.

## Stacks and guides

`typescript`, `javascript`, `react`, `node`, `rust`, `rust-tokio-postgres`, `postgres`,
`api`, `openapi`, `i18n`, `e2e`, plus the always-on `common` baseline.

## Project config

See [`templates/config.example.json`](templates/config.example.json). Key fields:

- `stacks`: which guides and reviewers apply
- `setup`: `[{ name, run, cwd? }]`, run in every new task worktree (e.g. dependency install)
- `validate`: `[{ name, run, cwd? }]`. All must pass before `baton done` opens a PR (its body
  comes from [`templates/pr-body.md`](templates/pr-body.md), at most two paragraphs, plus a
  `Validated:` line)
- `workflow.phases`: reorder or drop built-in phases, or add your own with
  `workflow.custom: { "<phase>": "docs/process/<phase>.md" }`
- `workflow.requireSpec | requireTdd | requireReview | baselineOnStart`: the gates
- `review.scopeToDiff`: off by default (every stack reviewer runs); on, a stack reviewer is
  skipped only when the diff provably doesn't touch its stack
- `hooks.factGate`: opt-in investigate-before-edit gate
- `conventions`: project rule files that override the stack guides

## CLI

`baton help` lists every command. Read commands accept `--json`.

## Staying current

Guides and skills go stale as Claude Code, libraries and the upstream projects they adapt keep
moving. [`provenance.json`](provenance.json) records the upstream commit each adapted file came
from, and the version-dependent facts the guides assert (e.g. `queryClient.query` needs TanStack
Query >= 5.102).

- `baton upstream` (maintainers, needs `gh`): upstream changes to adapted files since their
  baseline, and new releases outside the asserted versions. A weekly GitHub Action
  ([`drift.yml`](.github/workflows/drift.yml)) keeps one `drift` issue updated with the result.
- `baton doctor` (in a project, offline): the config, tools used by `setup`/`validate`, stacks
  detected but not enabled, and installed dependencies (npm, pnpm, Cargo lockfiles) outside what
  the guides assume.
- `npm test` fails if a recorded fact no longer appears in its guide.

## Development

```bash
npm test                       # node:test, no dependencies
claude plugin validate .
```

Changes to skills follow `.claude/skills/writing-skills` (red/green scenarios with fresh
subagents).

## Credits

Adapted from [obra/superpowers](https://github.com/obra/superpowers) and
[affaan-m/ECC](https://github.com/affaan-m/ECC), both MIT. The scope-of-change rules follow
[Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding
pitfalls, the React performance rules adapt [Vercel's react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices),
and several ideas come from [Symposium](https://github.com/symposium-dev/symposium).
See [NOTICE](NOTICE) for details.
