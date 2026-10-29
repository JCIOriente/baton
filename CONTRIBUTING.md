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
- After changing a description or the router (`skills/workflow`), run `make evals`. It runs
  the trigger cases in `evals/` (one per skill, plus prompts where no baton skill should load)
  against a scaffolded baton repo and checks which skill Claude loads. It costs about $6
  and is not part of `make ci`. To iterate on one case, run
  `claude plugin eval . --scaffold --trust-plugin --ablation none --runs 1 --case <name>`.
  When baton picks the wrong skill in a real repo, add that prompt as a case.
- Guides hold no project-specific rules.

## Adapting content from other projects

Only from compatible licenses. Credit the source in `NOTICE` and record the upstream repo, path
and commit in `provenance.json`. A guide statement that depends on a library version gets a
`facts` entry with the version range you verified. `npm test` checks that the entries match the
files.

## Commits and PRs

Conventional Commits (`feat(cli): ...`, `fix(hooks): ...`). The subject is usually enough; a
body, when the why needs one, is one or two short paragraphs. PRs use the template: at most two
paragraphs, the second saying what was not verified.

`CHANGELOG.md` is generated at release. baton's own PRs never edit it or version files.
