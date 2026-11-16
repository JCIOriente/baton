# Scenarios: handoff

Run each scenario as a fresh subagent that gets only `skills/handoff/SKILL.md` and the scenario
text (for the baseline, only the scenario text). There is no real repo: the scenario gives the
command output. Ask it to list, in order, the commands it would run, then give its reply to the
user word for word, and to stop where it would wait for the user.

Until `baton handoff` (#154) and `templates/handoff.md` (#152) merge, the scenarios stub their
output from the spec's nutshell (docs/specs/2026-11-15-session-handoffs.md).

## 1. Mid-unit, the session is long (expect: `baton handoff --spec`, every slot filled)

You are the controller session in the baton repo `example/members`, main checkout
`/home/dev/members`. This session's unit is `docs/specs/2026-11-20-gates-core.md`. In this
session: task #169 merged (PR #168) and its retro is done; the user ruled that gate names are
kebab-case, and you recorded that in a comment on #171. Tasks #170 and #171 are ready, #172 is
blocked on #170. The spec's Implementation status already ticks T1 (#169). Another session is
working on `docs/specs/2026-11-15-session-handoffs.md` (#160, #161). Earlier in this session the
user said: "After the gates tasks merge, the next session cuts the release: merge release PR #145."

`baton help` lists, among others: `handoff [--spec PATH] [--json]  Draft the next session's
prompt from GitHub and git state (read-only)`.

`baton handoff --spec docs/specs/2026-11-20-gates-core.md` prints:

```markdown
Continue members (this repo). Load baton:workflow.

## Goal
<FILL: the next unit, in one sentence>

## Where things stand
Next session's unit: docs/specs/2026-11-20-gates-core.md
- ready: #170, #171 · blocked: #172
- Implementation status still open: "T2 gate runner (#170)", "T3 gate results in verify (#171)", "T4 README gates section (#172)"
Other open work:
- docs/specs/2026-11-15-session-handoffs.md: in-progress #160 (arnold) · review #161 (PR #165, ci passing, review required)
- Open PRs without a task: #145 chore(main): release 0.7.0 [release PR]
Worktrees: #160 handoff-cli (uncommitted, 2 unpushed) /home/dev/members-worktrees/160
Base branch main: up to date with origin/main (as of last fetch)

## Stop at
<FILL: the stopping point, e.g. "all tasks merged and retro done">

## Next steps
<FILL: numbered steps>

## Rules
Follow baton:workflow and this repo's conventions; they hold the rules for this repo. Never `git commit --no-verify`.

## Leave alone
<FILL: other sessions' work; candidates: #160, #161, PR #165, PR #145, worktree 160>
```

The user says: "This session is getting long. Give me a prompt to continue in another session."

Expected: runs `baton handoff --spec docs/specs/2026-11-20-gates-core.md`; gives the prompt
inline in one block fenced with four backticks, with no `<FILL` left; next steps cover #170,
#171, then #172 after `baton unblock`, and the kebab-case ruling or its #171 comment; leave alone
lists #160, #161, PR #165 and worktree 160 but not PR #145, which the next session merges.

## 2. Closed unit (expect: ask which spec is next, then run without `--spec` if none)

You are the controller session in the baton repo `example/members`. This session's unit is
`docs/specs/2026-11-15-session-handoffs.md`. All its tasks merged, its Implementation status is
fully ticked on `main`, and its retro PR merged. `docs/specs/` also holds two drafts with no plan:
`2026-11-20-gates-core.md` and `2026-11-22-layout-guards.md`.

`baton handoff --spec docs/specs/2026-11-15-session-handoffs.md` prints the template with, under
"Where things stand":

```
Next session's unit: docs/specs/2026-11-15-session-handoffs.md
No open tasks.
Base branch main: up to date with origin/main (as of last fetch)
```

and the Leave alone slot `<FILL: other sessions' work; candidates: none>`.

The user says: "Great, that's done. Let's end this session and hand off."

Expected: says the unit is closed and asks which spec the next session works on (it may list the
two drafts), and stops for the answer. Does not pick a spec itself or give a prompt for the closed
unit.

Follow-up: the user answers "Not decided yet." Expected: runs `baton handoff` without `--spec`
and gives a prompt with no `<FILL` whose goal is to pick and spec the next unit with the user.

## 3. No GitHub access (expect: fill the template by hand, say the facts are not from GitHub)

You are the controller session in the baton repo `example/members`, main checkout
`/home/dev/members`, unit `docs/specs/2026-11-20-gates-core.md`. In this session #169 merged;
#170 and #171 are ready and #172 is blocked on #170, as of the last time you read the issues.

`baton handoff --spec docs/specs/2026-11-20-gates-core.md` exits 1:
`Could not read tasks and PRs from GitHub. Run gh auth login and try again.`
`gh auth status` says you are not logged in. `baton status` prints the worktrees:
`#171 gate-verify (clean, 0 unpushed) /home/dev/members-worktrees/171`. `git status` on `main`
is clean and up to date with `origin/main`. `${CLAUDE_PLUGIN_ROOT}/templates/handoff.md` is the
template above (scenario 1), with `{{project}}` and `{{facts}}` in place of the project name and
the "Where things stand" lines.

The user says: "I'm on a plane, I can't log in to GitHub. Just give me the prompt to continue
tomorrow."

Expected: fills the template by hand from `baton status`, git and what this session knows; gives
it with no `<FILL` and no `{{`; says the facts were not read from GitHub (so the task states may
be out of date) and the next session should check them with `baton list` or `baton handoff`.
Does not refuse, and does not present the prompt as read from GitHub.

## Results

Baseline (2026-11-15, no skill; the scenario gives `baton help` and the command's output): 2 runs
of each.

- Scenario 1: green on the facts. Both ran `baton help`, then `baton handoff --spec`, filled every
  slot, kept the kebab-case ruling and left PR #145 out of Leave alone with the reason. Both fenced
  the prompt with three backticks (```` ```markdown ````), which breaks on a fence inside it. Neither
  checked that the issues and the spec were current before drafting.
- Scenario 2: green. Both said the unit was closed, listed the two drafts and asked which is next;
  one offered "neither yet" as an option.
- Scenario 3: red on the shape. Both said the facts were not read from GitHub, but neither gave the
  template's prompt: one wrote its own shape with only "Where things stand" (no Goal, Stop at, Next
  steps, Rules or Leave alone); the other gave `[template text from handoff.md, verbatim, with:]`
  and a list of `{{project}} →` / `{{facts}} →` substitutions instead of a prompt to paste. A shape
  failure, so the fix is a recipe: the whole template, every slot filled.
