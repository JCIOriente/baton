# ADR-0001: Derive task status from GitHub data

- Status: proposed
- Date: 2026-10-25
- Deciders: Arnold Gandarillas
- Related: [spec](../specs/2026-10-25-derived-task-status.md)

## Context
baton stores each task's status as a label (`status:ready`, `status:in-progress`, `status:review`,
`status:blocked`) and rewrites it on claim, release, PR creation and unblock. Those labels repeat
facts GitHub already records (open or closed, assignee, linked PRs) and go stale whenever a step is
skipped or someone acts on GitHub directly. Agents trust them. Every baton command and skill
depends on how status is read, so the choice is expensive to change later.

## Options considered
1. **Keep status labels:** works today and is simple to read. Cons: drifts, needs a write at every
   transition, and mixes "planned" with "startable".
2. **GitHub Project Status field:** gives a board out of the box. Cons: still stored state, in a
   second system. Needs the `project` token scope and GraphQL for every write. No atomic updates.
3. **Derive status from issue type, blocker links, assignees and closing PRs:** nothing to keep in
   sync, and it uses GitHub's own UI concepts. Cons: needs a recent `gh` and a GraphQL listing
   query. User-owned repos have no issue types, so they need a label for "this is a task".

## Decision
Option 3. Status is computed on read. The only thing baton writes for a transition is the claim or
release comment and the assignee. Tasks are marked by the `Task` issue type, or a `task` label where
types are unavailable.

## Consequences
- `status-set` and `unblock` disappear, and so does every label write in claim, release and done.
- A stale claim is still possible (a session dies while assigned), but it shows up as an assignee
  rather than a hidden label.
- baton depends on `gh` supporting `--blocked-by`, `--parent` and `--type`. `doctor` checks this.
- Revisit if GitHub adds atomic issue updates, or if teams need workflow states that GitHub data
  cannot express (for example "in QA").
