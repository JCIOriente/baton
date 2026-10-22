# baton

A Claude Code plugin with one opinionated, configurable workflow for humans and AI agents
working on the same codebase:

```
spec -> plan -> backlog -> implement -> verify -> review -> integrate
```

It has no unrelated skills and no connectors. Stack guidance (TypeScript, React, Node, Rust,
tokio-postgres) loads only in repos that enable it.

## Install

```bash
# from a local checkout
claude plugin marketplace add /path/to/baton
claude plugin install baton@veloud
```

Requirements: Node >= 20, `git`, and `gh` (authenticated) for backlog commands.

## Use in a project

```
/baton:init                 # creates .baton/config.json (detects stacks), reviews it with you
/baton:spec <topic>         # idea -> approved spec in docs/specs/
/baton:plan                 # spec -> parallelizable tasks in docs/plans/
/baton:backlog              # plan -> GitHub issues with deps and priorities
/baton:implement 42         # claim #42, isolated worktree, test-first
/baton:verify               # run the project's validation, evidence before claims
/baton:review               # fresh-context review against spec + stack guides
/baton:integrate            # rebase, re-verify, PR, merge per policy, cleanup
/baton:parallel             # run several independent tasks at once
/baton:debug                # root cause before fixes
```

`baton:workflow` is the router. When a session starts in a configured repo, a hook tells
Claude to load it, along with the repo's phases, gates, stack guide paths and validation
commands.

## Architecture

| Concern | Where it lives |
|---|---|
| Shared task state (ownership, status, deps, history) | GitHub Issues: labels, assignees, `Depends on: #N`, claim marker comments |
| Local execution | one git worktree + branch per task (`../<repo>-worktrees/task-<n>-<slug>`); no shared mutable local files |
| Integration | `baton verify` (project-defined commands) -> `baton done` (PR `Closes #N`) -> review gate -> merge policy |
| Workflow definition | `.baton/config.json` in each project, falling back to defaults |
| Judgment (when/why) | `skills/*/SKILL.md` |
| Mechanics (how, the same way every time) | `baton` CLI (`cli/`, zero dependencies, on PATH via `bin/`) |

**Claims:** GitHub has no atomic compare-and-set, so `baton claim` posts a marker comment,
re-reads the thread, and the earliest claim since the last release wins. The loser rolls
back automatically. Markers count only when the comment author matches the claimed user.

**Cross-tool:** all state and logic live in the CLI and in plain markdown, so a Codex/other-agent
adapter only has to generate an `AGENTS.md` that points to the same skills and `baton` commands.
Not built yet.

## Project config

See [`templates/config.example.json`](templates/config.example.json). Key fields:

- `stacks`: `typescript | javascript | react | node | rust | rust-tokio-postgres`
- `validate`: `[{ name, run, cwd? }]`. All must pass before `baton done` opens a PR.
- `workflow.phases`: reorder or drop built-in phases, or add your own with
  `workflow.custom: { "<phase>": "docs/process/<phase>.md" }`.
- `workflow.requireSpec | requireTdd | requireReview`: the gates.
- `conventions`: project rule files that override the stack guides.

## CLI

`baton help` lists every command. Read commands accept `--json`.

## Development

```bash
npm test                       # node:test, no dependencies
claude plugin validate .
```

## Credits

The spec, plan, debug, verify and review skills adapt ideas from
[obra/superpowers](https://github.com/obra/superpowers) (MIT).
