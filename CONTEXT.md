# Domain context

Shared vocabulary for people and agents working on baton. Use these terms exactly, in code,
specs and issues. When a term is ambiguous or keeps needing explanation, add it here.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Task | An issue matching `tasks.kind` (type `Task`, or the `task` label): one unit of planned work, claimable by one holder | Any issue. A bug report is not a task until someone makes it one |
| Triage | An open issue that is not a task | The old `status:triage`, which no longer exists |
| Status | `ready`, `blocked`, `in-progress`, `review` or `done`, computed from GitHub data on every read, never stored | A label |
| Blocker | An issue linked with GitHub's "blocked by" relation. A task with an open blocker is `blocked` | A `Depends on:` line, which is no longer read |
| Plan issue | The parent issue of the tasks created from one plan. Links the spec and plan docs. Not claimable | The plan doc in `docs/plans/` |
| Claim | The marker comment that wins the race for a task. The assignee is set only after a claim wins | Assigning someone by hand |

## Relationships
A spec has one plan doc. A plan doc becomes one plan issue with tasks as its sub-issues. A task has
zero or more blockers, at most one holder (the assignee after a winning claim), and is done when a PR
that closes it merges.

## Decisions
- [ADR-0001](docs/adr/0001-derive-task-status.md): derive task status from GitHub data.
