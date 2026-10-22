# Contributing

baton is developed with its own workflow (`.baton/config.json`): issues are the backlog, work
happens in a task worktree, and PRs go through `baton done`.

## Checks

`make ci` runs everything CI runs: the tests, `claude plugin validate .` and a gitleaks scan.
Requirements: Node >= 20, [Claude Code](https://code.claude.com), [gitleaks](https://github.com/gitleaks/gitleaks).

## Changes to skills, guides and reviewer briefs

- Follow `.claude/skills/writing-skills`: run red/green scenarios with fresh subagents before
  changing a skill, and note the result in the PR.
- Skill descriptions state when to use the skill, never a summary of its steps.
- Guides hold no project-specific rules.

## Adapting content from other projects

Only from compatible licenses. Credit the source in `NOTICE` and record the upstream repo, path
and commit in `provenance.json`. A guide statement that depends on a library version gets a
`facts` entry with the version range you verified. `npm test` checks that the entries match the
files.

## Commits and PRs

Conventional Commits (`feat(cli): ...`, `fix(hooks): ...`). PRs use the template; the Test
plan says what was not verified.
