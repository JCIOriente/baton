# Controller context budget and session handoffs — Spec

- Status: approved (amended 2026-11-15 before implementation: the `baton:handoff` skill, picked by the user)
- Date: 2026-11-15
- Owner: Arnold Gandarillas
- Related: #133, docs/specs/2026-11-10-decision-points.md (the decision rules this builds on)

## TL;DR
- `baton:parallel` gains session-boundary rules, in a reference file it points to: one **unit**
  per controller session, a lean controller context (subagents and files hold the long output), and
  a **session handoff** at every unit boundary.
- New read-only command `baton handoff [--spec <path>] [--json]` drafts the handoff prompt from
  GitHub and git state: open tasks grouped by spec, open PRs, local worktrees, unchecked
  Implementation status items and the base branch's sync state.
- The judgment parts (goal, where to stop, next steps, what to leave alone) are `<FILL: …>` slots
  the agent fills before giving the prompt to the user. A prompt with `<FILL` never reaches the
  user.
- New skill **`baton:handoff`** (`/baton:handoff [spec path]`): runs the command, fills the slots
  and gives the finished prompt. It also loads when the user asks in words for a prompt to
  continue in another session, or when `baton:retro` or `baton:parallel` sends the agent there.
- One generic template, `templates/handoff.md`, used by the CLI and by the skill's manual path.
- `baton:retro` offers the session handoff when a unit ends; `baton:parallel` and `baton:workflow`
  §4 point to `baton:handoff`.

## Change in a nutshell
Mid-unit, or at a unit boundary with the next spec's path, the controller runs
`baton handoff --spec docs/specs/2026-11-20-gates-core.md` and gets:

```markdown
Continue baton (this repo). Load baton:workflow.

## Goal
<FILL: the next unit, in one sentence>

## Where things stand
Next session's unit: docs/specs/2026-11-20-gates-core.md
- ready: #170, #171 · blocked: #172
- Implementation status still open: "Plan and issues"
Other open work:
- docs/specs/2026-11-15-session-handoffs.md: in-progress #160 (arnold) · review #161 (PR #165, ci passing, review required)
- Open PRs without a task: #145 chore(main): release 0.7.0 [release PR]
Worktrees: #160 handoff-cli (uncommitted, 2 unpushed) /…/baton-worktrees/160
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

The agent replaces each slot, then sends the prompt inline in its reply. The facts come from the
command, so they can't drift from GitHub. Only the judgment is the agent's.

## Problem
Baton says the issues and committed docs carry a task's context (`skills/workflow/SKILL.md` §4,
`skills/parallel/SKILL.md` "Failure handling"). It doesn't say how a controller session spends its
context across a multi-task unit, when to end a session, or what to hand off. Long controller
sessions grow until each turn re-sends a large history, early details get summarized away, and
quality drops. The one handoff that worked well (#133's evidence) depended on a memory note and
docs that happened to be current, and the prompt was written by hand from chat history.

## Goals / Success criteria
- `baton handoff` prints a prompt whose facts (tasks with their status as `baton list` reports it,
  PRs, worktrees, open Implementation status items, base sync) match GitHub and git, verified by
  end-to-end tests against a fake `gh`.
- The command writes nothing: no files, no fetch, no comments, no label changes, no index refresh.
- It makes exactly two `gh` calls and never truncates silently.
- `skills/parallel/session-boundaries.md` holds the context-budget rules; `baton:handoff` holds the
  boundary procedure, and a writing-skills scenario shows it ending with a filled handoff prompt (no
  `<FILL`). `/baton:handoff` and a request in words both load it.
- `baton:retro` offers the fresh-session prompt when a unit closes; `baton:workflow` §4 points to
  the session handoff with no net growth in words.
- `make ci` passes.

## Non-goals
- Token counting, context-size limits or automatic session ending in the CLI.
- A slot validator command (the CLI never sees the agent's reply).
- `--out` (shell redirect does it), fetching, review-thread detail, session-memory integration in
  the CLI.
- Knowing which session owns a worktree or PR; the command lists facts and candidates only.
- An always-on line in `cli/lib/context.mjs` (option C was not picked).
- Waiting for derived task status (docs/specs/2026-10-25-derived-task-status.md, a draft with no
  plan); the command follows it through `summarize` when it lands.

## Approaches
- **A. Skill guidance and a handoff template only** vs **B. A plus a `baton handoff` command** vs
  **C. A plus an always-on context line.** A is smallest; B makes the prompt's facts deterministic
  at the cost of a new command with tests; C reaches sessions that never load parallel, at a
  context cost in every session. Picked by the user: **B**.
- The user then handed the remaining calls to a Fable subagent (2026-11-15). Everything below is
  therefore an **author's call**, not something the user agreed to:
  - Scope: everything open, grouped by spec; `--spec` names the next session's unit and the rest
    prints as "Other open work". `--spec` required would hide the work the leave-alone list needs;
    inferring the unit from claimed issues fails at a unit boundary, where nothing is claimed, and a
    claim names a GitHub login, which two sessions of the same user share.
  - Markdown on stdout plus `--json` with facts only; `<FILL: …>` slots with no CLI enforcement;
    strictly read-only; fail without `gh` access instead of printing a partial prompt; one generic
    template; pure functions in `cli/lib/handoff.mjs`; build on today's status logic.
  - Added on 2026-11-15, **picked by the user**: a `baton:handoff` skill, so the user can type
    `/baton:handoff` instead of asking in words. It owns the boundary procedure; the context-budget
    rules stay with `baton:parallel`.
  - The context-budget rules live in `skills/parallel/session-boundaries.md`, because
    `skills/parallel/SKILL.md` (~749 words) and `skills/workflow/SKILL.md` (~677) are already over
    the writing-skills ~600-word cap.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Anyone with read access to the repo and `gh` logged in | run `baton handoff` | — (the command is read-only) |

## Tenancy & localization
n/a: a developer tool; output is English like the rest of the CLI.

## Domain model
New terms in `CONTEXT.md`:
- **Unit**: the piece of work one controller session owns from start to end: one spec (each
  sub-project of a split spec has its own, `skills/spec/SKILL.md` step 2). It closes when
  `baton handoff --spec <spec>` shows no open tasks in its group and its retro is done.
- **Session handoff**: the self-contained prompt that starts the next session. Its facts come from
  `baton handoff`; its goal, stopping point, next steps and leave-alone list are filled by the
  agent. It never depends on chat history. Distinct from a phase hand-off (`skills/workflow/SKILL.md`
  §4) and a task's handoff comment (`skills/integrate/SKILL.md`).

## Interfaces
1. **`baton handoff [--spec <path>] [--json]`** in `cli/baton.mjs`, listed under Execution next to
   `status` with the help line
   `handoff [--spec PATH] [--json]  Draft the next session's prompt from GitHub and git state (read-only)`.
   - **`--spec <path>`** names the unit the next session will work on: the same spec when handing
     off mid-unit, the next spec at a unit boundary. Its group prints under "Next session's unit";
     everything else under "Other open work". Without `--spec` there is no unit: all groups print
     under "Other open work".
   - **Spec files.** Spec paths are relative to the repo root. A spec is read from
     `<remote>/<baseBranch>` (`git show`), falling back to the current checkout's working tree;
     `--spec` exists if either has it.
   - **GitHub reads.** Exactly two `gh` calls: one `issue list` (the provider's `list()` with
     `--limit 1000`; issue bodies are already in its fields) and one `pr list` through a new provider
     method `listPullRequests()` with fields
     `number,title,headRefName,isDraft,reviewDecision,statusCheckRollup,labels` and `--limit 1000`.
     At either limit, warn on stderr and set `truncated: true` in the JSON.
   - **Status.** Status comes from `summarize` as `baton list` reports it (`cli/baton.mjs:250`), so
     the command follows any later change to status logic without its own rules. Plan issues and
     other issues with no task status count as `triage`: left out, counted. No separate exclusion
     rule.
   - **Grouping.** A task's spec is the first line outside a code fence matching
     `^\s*(?:[-*]\s*)?Spec:\s*`; the value ends at ` · ` or end of line, `./` and markdown-link forms
     are normalized, only values ending in `.md` count, later matches are ignored
     (`templates/task.md:2` writes `Spec: <path> · Plan: <path>#t<N>`). Line endings are normalized
     first (issues edited on the web arrive with `\r\n`). Tasks without one go in a "No spec" group.
   - **PRs.** A PR links to a task through `issueFromBranch` (`cli/lib/git.mjs:63`) and is shown on
     that task. A PR whose issue is not an open task (closed, triage, or no issue in the branch) goes
     to "Open PRs without a task". `checks` is summarized from `statusCheckRollup` to
     `passing | failing | pending | none`. PRs with no task go in "Open PRs without a task"; one
     labelled `autorelease: pending` is tagged `[release PR]`.
   - **Worktrees.** The rows `baton status` builds (`cli/baton.mjs:702-712`) plus an unpushed-commit
     count. A branch with no upstream prints `not pushed`; stale and detached worktrees print no
     count. git runs with `GIT_OPTIONAL_LOCKS=0` (set in the process environment, so every child
     git inherits it).
   - **Base sync.** The base branch ahead/behind its remote-tracking ref, labelled "as of last
     fetch"; "no remote-tracking ref" when there is none, and then `ahead` and `behind` are `null`.
     `base.remote` is the configured remote's name, which the line prints (`origin/main`).
   - **Untrusted text.** The repo may be public and PR titles are written by anyone. PR titles and
     branch names are collapsed to one line and cut at 80 characters (`clip` in `cli/lib/handoff.mjs`). Task titles are
     not printed.
   - **Leave-alone candidates**, in this order: (a) tasks with status in-progress or review outside
     the unit's group, "No spec" included; (b) their PRs and every PR without a task, the release PR
     included; (c) non-stale worktrees whose task is not in the unit, and named worktrees other than
     the current one. Ready, blocked and triage issues are never candidates. Without `--spec` the
     slot reads `candidates: none (no --spec)`. Rendered as `#N` for tasks, `PR #N` for PRs, and
     `worktree <task number or branch>` for worktrees (JSON holds their paths).
   - **Fixed lines.** When they apply, "Where things stand" also prints, exactly:
     `No open tasks.` (no group has a task), `- no open tasks` (under the unit's heading when its
     group has no tasks), `Implementation status: file not found` (in a group
     whose spec file is missing), `No spec:` (the heading of that group), `Not listed: <n> triage
     issues` (when the count is above 0) and `Lists cut at 1000; more exist.` (when truncated).
   - **Output.** The rendered `templates/handoff.md` on stdout. `--json` prints facts only, every key
     always present (empty arrays, never omitted):
     ```json
     {
       "schemaVersion": 1,
       "unit": { "spec": "docs/specs/…md", "found": true },
       "groups": [{ "spec": "docs/specs/…md", "tasks": [{ "number": 160, "title": "…", "status": "in-progress", "assignees": ["arnold"], "pr": { "number": 165, "draft": false, "reviewDecision": "REVIEW_REQUIRED", "checks": "passing" } }], "openStatusItems": ["Plan and issues"] }],
       "prsWithoutTask": [{ "number": 145, "title": "…", "branch": "…", "release": true }],
       "worktrees": [{ "task": 160, "branch": "…", "path": "…", "current": false, "dirty": true, "stale": false, "unpushed": 2 }],
       "base": { "branch": "main", "remote": "origin", "ahead": 0, "behind": 0, "tracking": true },
       "leaveAloneCandidates": { "tasks": [160, 161], "prs": [165, 145], "worktrees": ["…/160"] },
       "triageCount": 3,
       "truncated": false
     }
     ```
     `unit` is `null` without `--spec`. `groups` holds every group: the unit's first (present even
     with no tasks), then by spec path, "No spec" last. A group's `spec` is `null` for "No spec";
     `openStatusItems` is `null` when the file is not found, and `pr` is `null` for a task without
     one. `unpushed` is `null` with no upstream, and for stale or detached worktrees. In JSON, titles
     are not shortened.
   - **Exit codes and streams.** 0 on success, including no open work; 1 for a `gh` failure and for
     an unknown `--spec` (the `BatonError` default); 2 for unexpected errors. On error, stdout is
     empty and the message goes to stderr, as other commands do.
2. **`cli/lib/handoff.mjs`**: pure functions `parseSpecRef(body)`, `groupBySpec(tasks, specPath?)`,
   `linkPullRequests(tasks, prs, issueOf)`, `openStatusItems(specText)`, `summarizeChecks(rollup)`,
   `leaveAloneCandidates(facts)`, `clip(text, max)`, `renderHandoff(template, facts, project)` and
   the constant `HANDOFF_TEMPLATE_PATH`, in the style of `cli/lib/tasks.mjs` ("pure functions only").
3. **`templates/handoff.md`**, generic for every repo: the first line
   `Continue {{project}} (this repo). Load baton:workflow.`; four slot sections (Goal, Stop at, Next
   steps, Leave alone) using the token `<FILL: what to write>`; a "Where things stand" section
   holding `{{facts}}`; and the fixed Rules section shown in the nutshell. `{{project}}` is
   `config.project`, else the repo root's basename. The renderer knows only `{{project}}` and
   `{{facts}}`; any other `{{…}}` is an error. The CLI loads the template through a path constant, as
   `cli/lib/git-guard.mjs:7` does.
4. **`skills/parallel/session-boundaries.md`** (new reference file), the rules:
   - one unit per controller session; end it at the unit boundary and start the next unit fresh;
   - delegate reading, implementing, verifying and reviewing to subagents, one pipeline of
     subagents per task; take back structured results only (PR number, head sha, verify result,
     findings), never file dumps or full logs;
   - send long output (test runs, eval runs, CI logs) to a file and read only the lines needed;
   - wait for CI and merges in background commands, not polled turns;
   - after a compaction, rebuild where things stand from `baton handoff` and the issues, not from the
     summary;
   - parallel sessions own disjoint worktrees and PRs; the prompt names the other session's as
     leave-alone; rebasing them after a merge is still fine;
   - at the unit boundary: load `baton:handoff` (Interface 9).
5. **`skills/parallel/SKILL.md`** gains at most 60 words: "One unit per controller session. When the
   context grows or after a compaction, read `session-boundaries.md` in this skill's directory and
   follow it; at a unit boundary, load `baton:handoff`."
6. **`skills/retro/SKILL.md`**: when `baton handoff --spec <spec>` shows no open tasks in the
   unit's group, offer to end the session and write the session handoff with `baton:handoff`.
7. **`skills/workflow/SKILL.md` §4**: the second sentence becomes a pointer: when the user wants to
   continue in another session, or at a unit boundary, load `baton:handoff`; the issue and committed
   docs carry the context, never chat history. `baton:handoff` is also added to the list of
   supporting skills. Net word change zero or less.
8. **`CONTEXT.md`**: the Unit and Session handoff rows.
9. **`skills/handoff/SKILL.md`** (new skill `baton:handoff`, `argument-hint: "[spec path]"`):
   - description, exactly: "Use when the user asks for a prompt to continue in another session or a fresh session, or to hand off or end this session, or when baton:retro or baton:parallel sends you here at a unit boundary, in a baton repo.";
   - steps: make sure the issues and the spec's Implementation status are current (changes to
     committed files go through a worktree and PR as always; say what is still stale) and update any
     session memory the agent has; pick the next session's spec: the argument; else, mid-unit, the
     unit being worked on; when that unit has no open tasks, ask which spec is next, and run without
     `--spec` if none is chosen yet; run `baton handoff [--spec <spec>]`; fill every `<FILL:` slot
     from the issues, the spec and this session's decisions, choosing leave-alone items from the
     printed candidates; give the prompt inline in one block fenced with four backticks;
   - rules: never give a prompt containing `<FILL`; never treat candidates as decided without checking
     them; without `gh` access, fill `${CLAUDE_PLUGIN_ROOT}/templates/handoff.md` by hand from
     `baton status` and git and say the facts were not read from GitHub; the prompt holds absolute
     local paths and is for the user's own next session;
   - at most 400 words by `wc -w` (the writing-skills cap is ~600).
10. **`README.md`**: directly after the `/baton:retro` line,
    `/baton:handoff <spec>      # prompt that starts the next session: facts from GitHub and git`.

## Behavior & edge cases
- `gh` missing, logged out or offline: exit 1 with "Could not read tasks and PRs from GitHub" and
  the hint to run `gh auth login`. `fromGithub` (`cli/baton.mjs:693-700`) gains a `what` parameter
  for this, and the hint drops "Nothing was changed" for this command. Nothing partial is printed: a
  git-only prompt would look complete without the issues.
- No open work: exit 0 and print the prompt with its slots. This is the normal case at a unit
  boundary.
- `--spec <path>` found in neither the base branch nor the working tree, and named by no task: exit
  1 naming the path. A file with no tasks yet (the next unit) is fine.
- Many specs: one compact group each: rows for in-progress and review, number lists for ready and
  blocked.
- Stale worktrees: flagged as `baton status` flags them, never candidates.
- A spec named by issues but missing in both places: the group prints and says the file was not
  found.

## Data & migrations
None. No config keys; the template path is fixed.

## Testing strategy
- Unit tests for `cli/lib/handoff.mjs` in the style of `cli/test/tasks.test.mjs`: the `· Plan:`
  tail, link and `./` forms, a fenced `Spec:` line, a second `Spec:` line, a non-`.md` value, no
  Spec line, `--spec` grouping, unchecked items only under `## Implementation status`, checks summary
  for success/failure/pending/empty rollups, candidate rules (a)-(c) including ready and blocked
  never listed, renderer errors on an unknown placeholder and keeps every slot.
- End-to-end with a fake `gh` on PATH (`cli/test/worktree-cli.test.mjs:32-65`): grouped output,
  `--spec` (found on the base branch only, in the working tree only, missing), `--json` shape with
  every key present, logged out (exit 1, nothing on stdout), no open work, PR without a task, release
  PR tagged, triage count, truncation warning at the limit, and exactly two `gh` calls in the fake's
  log.
- A test that `templates/handoff.md` has the four slot sections, the slot token and only the two
  known placeholders.
- Skill text: writing-skills red/green scenarios in `tests/skills/parallel.md` (when the context
  grows the agent opens `session-boundaries.md`; at a unit boundary it loads `baton:handoff` instead
  of starting the next unit), `tests/skills/retro.md` (new; a retro run when the unit's group has no
  open tasks offers the session handoff) and `tests/skills/handoff.md` (new; the prompt has no
  `<FILL`; at a closed unit it asks which spec is next; the manual path says the facts were not
  read from GitHub).
- Trigger eval `evals/handoff-request/` (paid, `make evals`, not in ci): "give me a prompt to continue
  in another session" loads `baton:handoff`.
- `make ci`.

## Decisions
No ADR: only this feature depends on these choices. `CONTEXT.md` gains Unit and Session handoff.

## FAQ
### Why doesn't the CLI check that the slots were filled?
It never sees the agent's reply. The rule lives in the skill, where the agent is, and the slot
token is greppable if a later eval wants to check it.

### Why fail instead of printing a git-only prompt when GitHub is unreachable?
A prompt without the issues looks complete and would mislead the next session. The skill's manual
path covers that case.

### Why group by the `Spec:` line rather than labels or milestones?
Every task issue already carries it (`templates/task.md:2`); baton has no spec labels or
milestones.

### Why are ready and blocked tasks never leave-alone candidates?
Nobody owns them, so a second session can't collide with them, and listing them invites the agent
to copy the list blindly. They still print under "Other open work".

## Open questions
None.

## Implementation status
- [x] Plan: docs/plans/2026-11-15-session-handoffs.md
- [x] T1 handoff template and pure core (#152)
- [x] T2 `baton handoff` command (#154)
- [x] T3 session-boundary rules in the skills (#153)
- [x] T4 `baton:handoff` skill (#156)
