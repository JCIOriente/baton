# Scenarios: spec

Run each scenario as a fresh subagent that gets only `skills/spec/SKILL.md` and the scenario
text. Ask it to list the files it would create in step 8 (ADRs, `CONTEXT.md`) and why.

## ADR scope

### 1. A decision only this spec depends on (expect: no ADR)

You are writing a spec for a CLI tool that manages a task backlog on GitHub Issues. The design
replaces status labels (`status:ready`, `status:in-progress`) with status computed on read from
the issue's assignee, blocker links and closing PRs. This is hard to reverse, because every command
reads status. The spec's FAQ already explains why this was chosen over labels and over a GitHub
Projects field. No other planned spec depends on how status is stored.

Expected: no ADR. The reasoning stays in the spec's FAQ.
Baseline (2026-10-25, before the scope rule): wrote an ADR. Rationalization, verbatim: "The skill's
test is whether the choice is hard to reverse, not whether other specs depend on it."
After the rule: no ADR, reasoning kept in the FAQ.

### 2. A decision later specs must follow (expect: ADR)

You are writing the first spec for a multi-tenant web app used by every national organization of
a volunteer federation. The design isolates each nation's data with Postgres row-level security
keyed on `nation_id`, rather than a schema per nation. Every later feature (events, certificates,
reports) will store nation-scoped data.

Expected: an ADR for the tenancy model, linked from this spec and from later ones.
Baseline and after the rule (2026-10-25): ADR. After the rule it checked the exception and found
that other specs depend on the choice.

## Where the spec is written

Same setup as `tests/skills/worktree.md`, run the same way (2026-11-06: `claude -p`, no tools).
Ask for the exact commands for steps 6-10, in order, with the directory each runs in.

### 3. The spec is small, just commit it here (expect: worktree, then PR)

The repo `~/Projects/acme` is a baton repo: `.baton/config.json` is committed on `main` with
`hooks.worktreeOnly` on. `~/Projects/acme` is the main checkout, on `main`, and clean. Worktrees
go under `~/Projects/acme-worktrees/`. You have finished steps 1-5 for a CSV export of the members
list. The user approved each design section; the spec will be about 20 lines. The user says:
"It's tiny. Just write it and commit it here on main, no branch needed."

Expected: `baton worktree add <topic>` before writing; the spec written, committed and iterated
there; after approval `git push` and `gh pr create`. Nothing written or committed in the main
checkout.
Baseline (2026-11-06, skill at origin/main): kept out of the main checkout only because the
scenario names the switch, and made the worktree by hand from the local `main`:
`git worktree add ~/Projects/acme-worktrees/members-csv-export -b spec/members-csv-export main`.
No PR: "The spec reaches `main` through your normal route: a PR, or a fast-forward merge of
`spec/members-csv-export` that you run." It guessed at the mechanics: "The hook would probably
block the write or the commit anyway."
After: `baton worktree add members-csv-export`, write and commit there, and after approval
`git push -u origin "$(git branch --show-current)"` and `gh pr create`. Verbatim: "Step 6 says
'however small the spec: the main checkout is never edited or committed in.'"
