<p align="center">
  <img src="https://raw.githubusercontent.com/JCIOriente/baton/main/assets/logo.svg" alt="baton logo: two batons meeting in a handoff zone" width="96" height="96">
</p>

<h1 align="center">baton</h1>

<p align="center">One workflow for humans and AI agents working on the same codebase.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@jcioriente/baton"><img src="https://img.shields.io/npm/v/@jcioriente/baton" alt="npm version"></a>
  <a href="https://github.com/JCIOriente/baton/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/JCIOriente/baton/ci.yml?branch=main" alt="CI status"></a>
  <a href="https://github.com/JCIOriente/baton/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

baton is a Claude Code plugin with one opinionated, configurable workflow for humans and AI
agents working on the same codebase:

```
spec -> plan -> backlog -> implement -> verify -> review -> integrate (-> retro)
```

A task is like a baton: exactly one holder at a time, handed off explicitly.

- **One holder at a time.** Tasks are GitHub issues. Claims are race-safe, so two people
  never hold the same task.
- **Every change in its own worktree.** The main checkout stays on the base branch and only
  fast-forwards; guards refuse edits and commits there.
- **Gates you configure.** Spec before plan, tests first, review before merge. Your project's
  blocking validation steps must pass before a PR opens.
- **Nothing is learned privately.** `baton:retro` turns review and verification evidence into
  conventions and ADRs through reviewed PRs.

The plugin has no unrelated skills and no connectors. Stack guides and reviewers load only in
repos that enable them.

## Install

```sh
claude plugin marketplace add JCIOriente/baton
claude plugin install baton@jcioriente
```

Pin a release for a project by installing from a tag (see the
[CHANGELOG](https://github.com/JCIOriente/baton/blob/main/CHANGELOG.md)).

Requirements: Node >= 22, `git`, and `gh` (authenticated) for backlog commands. The suggested
`secrets` validation step uses [gitleaks](https://github.com/gitleaks/gitleaks).

## Quick start

Run these inside Claude Code, in your project.

1. **Set up the project.** This writes `.baton/config.json`: it detects your stacks and reviews
   setup, validation and gates with you.

   ```
   /baton:init
   ```

2. **Turn an idea into work.** Write a spec, break it into a plan, and file the tasks as GitHub
   issues.

   ```
   /baton:spec <topic>
   /baton:plan
   /baton:backlog
   ```

3. **Work a task.** Claim issue #42 in its own worktree, test-first, then verify, review and
   open the PR.

   ```
   /baton:implement 42
   /baton:verify
   /baton:review
   /baton:integrate
   ```

`baton:workflow` is the router. When a session starts in a configured repo, a hook tells
Claude to load it, along with the repo's phases, gates, guide paths and validation commands.

## Commands

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
/baton:deps <package>       # vet a dependency add/upgrade: registry version, audit, lockfile
/baton:retro                # lessons -> conventions/ADRs via reviewed PRs
/baton:handoff <spec>       # prompt that starts the next session: facts from GitHub and git
```

The `baton` CLI does the mechanics behind these skills. `baton help` lists every command.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Architecture](https://github.com/JCIOriente/baton/blob/main/docs/architecture.md) | Where task state, worktrees, skills and the CLI live; claims, the fact gate and the worktree guard |
| [Configuration](https://github.com/JCIOriente/baton/blob/main/docs/configuration.md) | `.baton/config.json` fields, stacks and guides, releases and the CLI |
| [Staying current](https://github.com/JCIOriente/baton/blob/main/docs/staying-current.md) | How guides track upstream changes: `provenance.json`, `baton upstream` and `baton doctor` |
| [Contributing](https://github.com/JCIOriente/baton/blob/main/CONTRIBUTING.md) | Setting up, the checks, and changing skills |

## Development

```sh
git clone https://github.com/JCIOriente/baton.git
cd baton
npm ci
make ci        # gitleaks, Biome, tests and plugin validation
```

Changes to skills follow `.claude/skills/writing-skills` (red/green scenarios with fresh
subagents). The design is in
[`docs/specs`](https://github.com/JCIOriente/baton/tree/main/docs/specs), and the decisions
behind it are in [`docs/adr`](https://github.com/JCIOriente/baton/tree/main/docs/adr).

## Credits

Adapted from [obra/superpowers](https://github.com/obra/superpowers) and
[affaan-m/ECC](https://github.com/affaan-m/ECC), both MIT. The scope-of-change rules follow
[Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding
pitfalls. The React performance rules are adapted from
[Vercel's react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices),
and several ideas come from [Symposium](https://github.com/symposium-dev/symposium).
See [NOTICE](https://github.com/JCIOriente/baton/blob/main/NOTICE) for details.

## License

baton is licensed under the
[MIT License](https://github.com/JCIOriente/baton/blob/main/LICENSE).
