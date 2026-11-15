# Controller context budget and session handoffs — Implementation Plan

- Spec: [docs/specs/2026-11-15-session-handoffs.md](../specs/2026-11-15-session-handoffs.md)
- Date: 2026-11-15
- Status: draft

## Overview
Three tasks, cut by file ownership. The pure core and the template come first, because the
command renders the template and calls the core. The skill text needs only the command's name,
flags and slot token, which the spec fixes, so it runs in parallel with both CLI tasks.

- T1: `templates/handoff.md` and the pure functions in `cli/lib/handoff.mjs`, with unit tests
- T2: the `baton handoff` command, the provider's `listPullRequests()`, `fromGithub`'s `what`
  parameter, and end-to-end tests with a fake `gh`
- T3: the session-boundary rules (`skills/parallel/session-boundaries.md`), the pointers in
  `baton:parallel`, `baton:retro` and `baton:workflow` §4, and their writing-skills scenarios

`CONTEXT.md` (Unit, Session handoff) merges with the spec.

## Contract
No API. Fixed by the spec and used as written:
- Command: `baton handoff [--spec <path>] [--json]`, help line
  `handoff [--spec PATH] [--json]  Draft the next session's prompt from GitHub and git state (read-only)`.
- Slot token `<FILL: what to write>`; slot sections Goal, Stop at, Next steps, Leave alone;
  placeholders `{{project}}` and `{{facts}}` only.
- The `--json` shape in spec Interface 1, `schemaVersion: 1`.
- Terms: **unit**, **session handoff** (`CONTEXT.md`).

## Impact
- **Affected call paths and consumers:** `fromGithub` (`cli/baton.mjs:693-700`) is shared with
  `worktree clean`; T2 adds a `what` parameter whose default keeps today's message and hint, so
  `worktree clean` output is unchanged (its tests in `cli/test/worktree-cli.test.mjs` stay green).
  The GitHub provider gains one method; existing methods are untouched. `baton:parallel`,
  `baton:retro` and `baton:workflow` reach every baton repo on the next release.
- **Data and migrations:** none.
- **Tests that must stay green:** `make ci` (all of `cli/test`, plugin validation); the trigger
  evals `parallel-backlog`, `retro-after-merge` and `workflow-refactor` (run with `make evals`
  before the release, not per task).
- **Rollout and rollback:** shipped in the next release; each task reverts on its own. Nothing is
  gated by config.

## Dependency graph
```
T1 ──> T2
T3 (independent)
```
Can start immediately in parallel: T1, T3

## Tasks

### T1: handoff template and pure core  (#issue)
- Priority: 1
- Depends on: none
- Owns: `templates/handoff.md` (new), `cli/lib/handoff.mjs` (new), `cli/test/handoff.test.mjs` (new)
- Touches (read-only or additive): `cli/lib/tasks.mjs` (read, for style). `oneLine` is private to
  `cli/baton.mjs:688` (owned by T2), so `handoff.mjs` has its own `clip(text, max)` that collapses
  whitespace to one line and cuts at `max`
- Interfaces:
  - Produces: `parseSpecRef(body: string): string | null`
  - Produces: `groupBySpec(tasks: Task[], specPath?: string): { unit: Group | null, others: Group[] }`
    where `Group = { spec: string | null, tasks: Task[] }` and `Task` is a `summarize` row plus
    `body`
  - Produces: `openStatusItems(specText: string | null): string[] | null`
  - Produces: `summarizeChecks(rollup: object[] | null): 'passing' | 'failing' | 'pending' | 'none'`
  - Produces: `leaveAloneCandidates(facts: Facts): { tasks: number[], prs: number[], worktrees: string[] }`
  - Produces: `renderHandoff(template: string, facts: Facts, project: string): string`
  - Produces: `HANDOFF_TEMPLATE_PATH: string`
  - `Facts` is the spec's `--json` object (Interface 1) minus `schemaVersion`.
- Acceptance:
  - [ ] `parseSpecRef` returns `docs/specs/x.md` for `Spec: docs/specs/x.md · Plan: docs/plans/x.md#t1`
        under `## Context`, for `- Spec: ./docs/specs/x.md` and for `Spec: [x](docs/specs/x.md)`;
        returns `null` for a fenced `Spec:` line only, a non-`.md` value, or no Spec line; takes the
        first match when there are two.
  - [ ] `groupBySpec` puts tasks with no Spec line in a `spec: null` group and the `--spec` group in
        `unit` (an empty group when no task names it).
  - [ ] `openStatusItems` returns unchecked `- [ ]` lines under `## Implementation status` only, and
        `null` for `null` input.
  - [ ] `summarizeChecks` maps all-success to `passing`, any failure/error/cancelled/timed-out to
        `failing`, any queued or in-progress to `pending`, empty or null to `none`.
  - [ ] `leaveAloneCandidates` lists in-progress and review tasks outside the unit (No spec
        included), their PRs and every PR without a task, and non-stale worktrees outside the unit
        other than the current one; never ready, blocked or triage tasks; all empty without a unit.
  - [ ] `renderHandoff` fills `{{project}}` and `{{facts}}`, keeps every `<FILL:` slot, writes
        `candidates: none (no --spec)` in the Leave alone slot without a unit, collapses PR titles
        and branch names to one line cut at 80 characters, prints no task titles, and throws on any
        other `{{…}}`.
  - [ ] The template has the first line `Continue {{project}} (this repo). Load baton:workflow.`,
        the sections Goal, Where things stand, Stop at, Next steps, Rules, Leave alone, and the Rules
        text from the spec's nutshell.
- Tests first: `parse_spec_ref_strips_plan_tail`, `parse_spec_ref_ignores_fenced_line`,
  `parse_spec_ref_first_match_wins`, `parse_spec_ref_rejects_non_md`, `group_by_spec_no_spec_group`,
  `group_by_spec_unit_without_tasks`, `open_status_items_only_under_section`,
  `summarize_checks_states`, `leave_alone_excludes_ready_and_blocked`,
  `leave_alone_empty_without_unit`, `render_keeps_slots`, `render_rejects_unknown_placeholder`,
  `render_truncates_untrusted_text`, `template_has_slot_sections`
- Notes: pure functions only (header of `cli/lib/tasks.mjs`); test style of
  `cli/test/tasks.test.mjs`. Path constant as `cli/lib/git-guard.mjs:7` does. No I/O in this module.

### T2: `baton handoff` command  (#issue)
- Priority: 1
- Depends on: T1
- Owns: `cli/test/handoff-cli.test.mjs` (new); in `cli/baton.mjs` the new `handoff` command, its
  help line and the `fromGithub` change; in `cli/lib/providers/github.mjs` the new
  `listPullRequests()`
- Touches (read-only or additive): `cli/lib/git.mjs` (additive helpers only if needed: unpushed
  count, ahead/behind, `git show` of a base-branch file, all with `GIT_OPTIONAL_LOCKS=0`),
  `cli/test/worktree-cli.test.mjs` (read, for the fake-`gh` pattern)
- Interfaces:
  - Consumes: `parseSpecRef`, `groupBySpec`, `openStatusItems`, `summarizeChecks`,
    `leaveAloneCandidates`, `renderHandoff`, `HANDOFF_TEMPLATE_PATH` from `cli/lib/handoff.mjs` (T1)
  - Produces: `GithubProvider.listPullRequests({ limit = 1000 } = {}): { number, title, headRefName, isDraft, reviewDecision, statusCheckRollup, labels }[]`
  - Produces: `fromGithub(lookup, what = 'PR state')` with today's message and hint as the default
  - Produces: `baton handoff [--spec <path>] [--json]`, exit codes 0/1/2 as in the spec
- Acceptance:
  - [ ] Against a fake `gh` with tasks in two specs, a No-spec task, a triage issue, a task PR and a
        release PR: the markdown output groups them as the spec's nutshell does, tags `[release PR]`,
        and prints the triage count.
  - [ ] `--spec` with the file only on `origin/<base>`, only in the working tree, and in neither
        (exit 1, path named, stdout empty).
  - [ ] `--json` has every key in the spec's shape with `schemaVersion: 1`, empty arrays rather
        than missing keys, and `unit: null` without `--spec`.
  - [ ] Logged-out `gh`: exit 1, stdout empty, stderr "Could not read tasks and PRs from GitHub"
        with the `gh auth login` hint and without "Nothing was changed".
  - [ ] No open work: exit 0, prompt printed with all four slots.
  - [ ] The fake `gh` log shows exactly two calls (`issue list`, `pr list`), each with
        `--limit 1000`; at the limit, a stderr warning and `truncated: true`.
  - [ ] Worktrees show uncommitted, unpushed count, `not pushed` with no upstream, and no count for
        stale ones; base sync says "as of last fetch" or "no remote-tracking ref".
  - [ ] The command writes nothing: the repo's `git status --porcelain` and the fake `gh` log show no
        writes.
  - [ ] `worktree clean`'s existing logged-out test still passes unchanged.
- Tests first: `handoff_groups_by_spec`, `handoff_spec_from_base_branch`,
  `handoff_spec_from_working_tree`, `handoff_unknown_spec_fails`, `handoff_json_shape`,
  `handoff_logged_out_fails_cleanly`, `handoff_no_open_work`, `handoff_two_gh_calls`,
  `handoff_truncation_warns`, `handoff_worktree_flags`, `handoff_is_read_only`
- Notes: status through `summarize` (`cli/baton.mjs:246`), never labels directly. Worktree rows as
  `status` builds them (`cli/baton.mjs:702-712`); extract a shared helper inside `baton.mjs` rather
  than copying. Fake `gh` on PATH as `cli/test/worktree-cli.test.mjs:32-65`.

### T3: session-boundary rules in the skills  (#issue)
- Priority: 1
- Depends on: none
- Owns: `skills/parallel/session-boundaries.md` (new), `skills/parallel/SKILL.md`,
  `skills/retro/SKILL.md`, `skills/workflow/SKILL.md`, `tests/skills/parallel.md`,
  `tests/skills/retro.md` (new)
- Touches (read-only or additive): `CONTEXT.md` (read), `templates/handoff.md` (read once T1 lands;
  the spec fixes its shape)
- Interfaces: none (skill text)
- Acceptance:
  - [ ] `skills/parallel/session-boundaries.md` holds every rule in spec Interface 4, including
        "never give a prompt containing `<FILL`", the manual path through
        `${CLAUDE_PLUGIN_ROOT}/templates/handoff.md`, and updating any session memory.
  - [ ] `skills/parallel/SKILL.md` gains at most 60 words, pointing to the file (spec Interface 5).
  - [ ] `skills/retro/SKILL.md` offers to end the session and draft the session handoff when the
        retro closes a unit, as the Domain model defines it.
  - [ ] `skills/workflow/SKILL.md` §4's second sentence becomes the session-handoff pointer, with a
        net word change of zero or less.
  - [ ] `tests/skills/parallel.md` records a baseline and a green run: at a unit boundary the agent
        opens `session-boundaries.md` and ends with a filled prompt (no `<FILL`) instead of starting
        the next unit.
  - [ ] `tests/skills/retro.md` records a baseline and a green run: a retro that closes a unit offers
        the session handoff.
  - [ ] `make ci` passes (plugin validation).
- Tests first: the two scenarios' baseline runs, recorded before the edits.
- Notes: follow the repo's `writing-skills` skill; use "session handoff" (not "hand-off" or
  "handoff comment"). Until T2 merges, the scenarios may stub `baton handoff` output from the spec's
  nutshell.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Command, flags, help line, exit codes, streams | T2 |
| Two `gh` calls, limit, truncation | T2 |
| Spec files from base branch, then working tree | T2 |
| Status through `summarize`, triage counted | T2 |
| `Spec:` parsing rules | T1 |
| PR linking, checks summary, release PR tag | T1 (pure), T2 (wiring) |
| Worktree flags, unpushed count, `GIT_OPTIONAL_LOCKS=0` | T2 |
| Base sync | T2 |
| Untrusted text collapsed and cut, no task titles | T1 |
| Leave-alone candidate rules | T1 |
| `--json` shape | T1 (Facts), T2 (`handoff_json_shape`) |
| Generic template, two placeholders, slot token | T1 |
| Read-only | T2: `handoff_is_read_only` |
| `fromGithub` `what` parameter, `worktree clean` unchanged | T2 |
| Session-boundary rules, pointers, retro offer | T3 |
| Unit, Session handoff terms | spec PR (`CONTEXT.md`) |
| Failure mode: issue body with a `Spec:` line inside a code fence | T1: `parse_spec_ref_ignores_fenced_line` |
| Failure mode: PR title with a newline | T1: `render_truncates_untrusted_text` |
| Failure mode: `--spec` file that exists only in a worktree | T2: `handoff_spec_from_working_tree` |
| Failure mode: worktree branch with no upstream | T2: `handoff_worktree_flags` |
| Failure mode: more than 1000 open issues | T2: `handoff_truncation_warns` |
