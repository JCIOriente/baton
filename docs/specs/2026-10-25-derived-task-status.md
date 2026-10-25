# Derived task status — Spec

- Status: draft
- Date: 2026-10-25
- Owner: Arnold Gandarillas
- Related: [ADR-0001](../adr/0001-derive-task-status.md)

## TL;DR
- baton stops storing task status in labels. `ready`, `blocked`, `in-progress` and `review`
  are computed from data GitHub already keeps: issue type, blocker links, assignees and closing PRs.
- Backlog tasks are issues of type **Task**. In repos owned by a personal account, which have no
  issue types, they carry a `task` label instead. Anything else (bug reports, questions) is
  triage and is never offered by `baton next`.
- Dependencies use GitHub's native "blocked by" links instead of a `Depends on: #12` line in
  the body. A plan becomes a parent issue whose tasks are its sub-issues.
- GitHub Projects stay out of baton. A board can be built on top as a read-only view for people.
- Breaking change with no migration (no repo depends on the old labels).

## Change in a nutshell
Today `baton claim 12` posts a claim comment, assigns you and swaps `status:ready` for
`status:in-progress`. If the session dies, or someone merges the PR by hand, the label is wrong
and `baton next` trusts it.

After this change, the same command posts the claim comment and assigns you. Nothing else is
written. `baton list` shows #12 as `in-progress` because it is open and assigned. Once a PR
saying `Closes #12` is open it shows `review`, and once the PR merges it shows `done`. There is no
label to forget.

```
$ baton list
#14   blocked      -         Attendance CSV endpoint      (blocked by #12)
#12   in-progress  arkgast   Attendance history query
#15   ready        -         Profile page download link
```

## Problem
Status lives in four labels that the CLI rewrites at `claim` (`cli/lib/providers/github.mjs:102`),
`release` (`:117`), `done` (`cli/baton.mjs:503`) and `unblock` (`cli/baton.mjs:280`).
`statusOf` (`cli/lib/tasks.mjs:33`) then trusts those labels. Any step that is skipped, or any edit
made by hand on GitHub, leaves a label that contradicts the issue's real state. Agents act on that
state without a second look. Separately, the Issues tab mixes the planned backlog with outside
reports, because "is this a planned task?" is the same `status:ready` label as "can it start?".

## Goals / Success criteria
- No command writes a status. `grep` finds no `status:` label names in `cli/` after the change.
- Status computed from GitHub data matches the table in Domain model for every case in the tests.
- `baton next` never offers an issue that is not a Task, is assigned, has an open blocker, or has
  an open closing PR.
- Listing the backlog takes one GraphQL request per 100 open issues, with no per-issue calls.
- A bug report filed by an outsider does not appear in `baton next` or `baton list` until someone
  makes it a Task.

## Non-goals
- GitHub Projects support (fields, boards, sync). Documented as a manual, read-only view.
- Migrating repos that use the old status labels.
- Priority as anything other than the existing `priority:p0`..`p3` labels. Priority is an
  attribute set by people, not a state, so it cannot drift.
- Cross-repo tasks. Blockers may live in another repo (GitHub allows it), but `baton next` only
  offers tasks from the configured repo.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Contributor (repo write) | Claim, release, create tasks, link blockers | Claim a task someone else holds |
| Outsider (no write) | File issues, which land in triage | Make an issue a Task, claim |
| Agent | Same as the user whose `gh` token it uses | Same |

Setting an issue type, assignee or "blocked by" link needs write access, which is already true
for the labels it replaces.

## Tenancy & localization
n/a. Status names are CLI identifiers. Issue type and label names are configurable (see Interfaces).

## Domain model
A **task** is an open or closed issue that matches `tasks.kind` (type `Task`, or label `task`).
Its status is computed, in this order (the first matching row wins):

| Status | Condition |
|---|---|
| done | issue closed |
| review | open, and at least one open PR references it with a closing keyword (draft or not) |
| in-progress | open, has an assignee |
| blocked | open, at least one "blocked by" issue is open |
| ready | open, none of the above |

An open issue that does not match `tasks.kind` is **triage**: listed only by `baton list --triage`,
never claimable.

The assignee, not the claim comment, marks in-progress, because reading comments for every issue
would cost one request per issue. The claim comment stays the arbiter of the claim race
(`activeClaim`, `cli/lib/tasks.mjs:113`). The assignee is written only after a claim wins, and
removed by `release`.

A **plan issue** is the parent of the tasks created from one plan. It is not a Task, so it is never
claimable. Its body links the spec and plan docs.

## Interfaces

**Config** (`.baton/config.json`):
```json
"tasks": {
  "provider": "github",
  "repo": null,
  "kind": { "type": "Task" },
  "priorityPrefix": "priority:"
}
```
`kind` is `{ "type": "<issue type>" }` or `{ "label": "<label>" }`. `tasks.labels` is removed. An
old config that still has it fails `baton doctor` with a message to delete it.

**Reading:** one paginated GraphQL query per listing (100 issues per page) fetching number, title,
state, url, issueType, labels, assignees, `blockedBy { number state repository }`, `parent { number }`
and `closedByPullRequestsReferences(includeClosedPrs: false) { number state isDraft }`. It is
filtered by `filterBy: { type }` or `labels`. The query shape was checked against the GitHub API on
2026-10-25.

**Commands:**
| Command | Change |
|---|---|
| `baton list [--status S] [--mine] [--triage]` | Derived status. `--triage` lists open non-Task issues |
| `baton next` | Derived ready, ranked by priority then number. No `openNumbers` call |
| `baton show <n>` | Prints blockers with their state, the parent plan issue and any closing PR |
| `baton create --title T [--body-file F] [--priority P] [--blocked-by 12,14] [--parent N]` | Creates a Task via `gh issue create --type` or `--label`, plus `--blocked-by` and `--parent`. `--depends-on` and `--ready` are removed |
| `baton claim <n>` | Refuses when an open blocker exists (unless `--force`). Comment, re-read, assign. No label edits |
| `baton release <n>` | Release comment and unassign. No label edits |
| `baton done` | Opens the PR as today. No status write |
| `baton labels` | Creates only the priority labels, and the `task` label when `kind` is a label |
| `baton init` | Sets `kind` to `{ "type": "Task" }` if the repo owner has a `Task` issue type, otherwise `{ "label": "task" }` |
| `baton doctor` | Checks that `gh issue create --help` lists `--blocked-by`, `--parent` and `--type` (upgrade hint otherwise), that the configured type or label exists, and that `tasks.labels` is absent |
| `baton status-set`, `baton unblock` | Removed. There is nothing to set or release |

**Skills:**
- `backlog` creates a plan issue, then the tasks in dependency order with `--parent` and
  `--blocked-by`. Its section on labels and `Depends on` lines goes away. "Waiting on a decision" is
  handled by opening an issue for the decision and linking it as a blocker.
- `integrate` drops the `baton unblock` step. When the merged task was the last open sub-issue of
  its plan issue, it closes the plan issue with a comment linking the merged PRs.
- `plan` and `templates/plan.md` keep `Depends on: T1` between plan tasks. `backlog` turns those
  into blocker links.
- `README.md` architecture table, and a short "Board for people" section: create a GitHub Project
  that auto-adds issues of type Task and groups by status. baton never writes to it.

## Behavior & edge cases
- **Claim race:** unchanged. Two sessions claim, and the earliest comment wins. The loser never
  assigns, so in-progress shows only the winner.
- **Assigned without a claim** (someone assigns by hand): shows in-progress, and `baton claim` by
  someone else refuses, as today (`github.mjs:90`).
- **Session dies after claiming:** the issue stays in-progress until released, as today.
  `baton list` shows the assignee, which makes stale claims visible.
- **Closing PR closed without merging:** it drops out of `closedByPullRequestsReferences`
  (`includeClosedPrs: false`), so the task falls back to in-progress or ready.
- **A PR that mentions the issue without a closing keyword** does not make it review. `baton done`
  always writes `Closes #N` (`cli/lib/tasks.mjs:71`).
- **Blocker in another repo:** counted by its own state. The token may not be able to read it. A
  blocker that comes back as null counts as open, and `baton show` says it could not be read.
- **Blocker cycle:** both tasks stay blocked. `baton show` prints the chain so a person can break it.
- **Issue type removed from the org:** `baton doctor` reports it. Listing returns no tasks rather
  than everything.
- **More than 50 blockers or 5 closing PRs on one issue:** only the first page is read. That is
  enough for a task, and `baton show` warns when `totalCount` exceeds the page.

## Data & migrations
None for GitHub data. Old `status:*` labels on existing issues are ignored and can be deleted by
hand. Config: `tasks.labels` removed, `tasks.kind` and `tasks.priorityPrefix` added (defaults
filled by `config.mjs` as today).

## Testing strategy
- Unit (`cli/test`): a pure `statusOf(issue, kind)` over fixture GraphQL nodes covering every row
  of the status table, the precedence between rows, triage, a null cross-repo blocker and a closed
  unmerged PR. `rankClaimable` without `openNumbers`.
- Unit: the config default for `kind`, the doctor message for a leftover `tasks.labels`, and the
  argument building for `create` in type and label mode.
- Live check, by hand, on a throwaway repo under the JCIOriente org and one under a personal
  account: create a plan issue and two tasks with a blocker, claim, `done`, merge, and check that
  `baton list` shows the right status at each step. Record the output in the PR.
- `make evals`: the trigger suite still passes after the `backlog` and `integrate` skill edits.

## Decisions
- [ADR-0001](../adr/0001-derive-task-status.md): derive task status from GitHub data instead of
  storing it.
- `CONTEXT.md` adds: task, triage, blocker, plan issue, claim.

## FAQ
### Why not use a GitHub Project's Status field?
It is stored state again, in a second system. It needs the `project` token scope for every
contributor and has no atomic update either. A Project works well as a view, and can be built on
top of this design without baton knowing about it.

### Why the assignee rather than the claim comment for in-progress?
The claim comment would mean reading every issue's comments to build one list. The assignee comes
back in the listing query, is visible in GitHub's UI and is written only by a winning claim.

### Why keep priority labels?
Priority is a decision people make and change on purpose. It cannot go stale the way "in progress"
does. Moving it would add a dependency without fixing anything.

## Open questions
None.

## Implementation status
- [ ] Plan: docs/plans/2026-10-25-derived-task-status.md
