---
name: plan
description: Use when an approved spec exists in a baton repo and has no implementation plan yet, or when the user asks to break work into tasks.
argument-hint: "[spec path]"
---

# Plan

Turn an approved spec into tasks that different people or agent sessions can take on
**in parallel without stepping on each other**. The plan is the contract between the spec and the
backlog.

Assume whoever implements a task is skilled but has zero context. They read the issue, the
spec and the stack guides, and nothing else.

## Steps

1. Read the spec and the relevant code. If the spec has gaps, go back to `baton:spec`. Don't
   paper over gaps in the plan.
2. **Cut tasks along file and module boundaries.** Each task should:
   - deliver one testable increment (a vertical slice is better than a layer)
   - fit in one focused session, roughly 1-4 hours of human work
   - own a declared set of files/modules. Two tasks that can run at the same time must not
     own the same file. Shared foundations (schema, shared types, permission definitions)
     become their own task that others depend on.
   - **Contract first:** when frontend and backend work (or two services) happen in parallel,
     the API contract is its own first task. It produces the OpenAPI document (see the
     `openapi` guide). Consumer and provider tasks both depend on it and build against it,
     with mocks generated from the spec, instead of waiting on each other.
3. **Make dependencies explicit.** A task depends on another only if it truly can't start
   before that one merges. Maximize what can run in parallel.
4. **Write acceptance criteria as checks**, e.g. "`POST /orgs` with a non-admin token returns
   403". Avoid criteria like "permissions work".
5. **Name the tests first**, so TDD has a starting point: the test cases that must fail
   before implementation and pass after.
6. **Impact check for risky changes** (schema/migrations, auth/permissions, public API,
   shared modules): before cutting tasks, list the call paths, consumers, data and tests
   affected, plus how to roll it out and roll it back. Put this in the plan's Impact section.
   If a change can break a module that depends on it, add that module's checks to the task's
   acceptance criteria, or to `validate` if it applies to every change.
7. Write the plan from `${CLAUDE_PLUGIN_ROOT}/templates/plan.md` to
   `<docs.plans>/YYYY-MM-DD-<topic>.md`. Link the spec.
8. **Self-review:** check that every spec requirement maps to at least one task and that no
   task lacks an acceptance criterion. Check for file-ownership overlaps between parallel
   tasks and for dependency cycles.
9. Commit, ask the user to approve, then hand off to `baton:backlog`.

## Task block format

Each task in the plan uses this block, which `baton:backlog` turns into an issue body:

```markdown
### T3: Organization CRUD API
- Priority: 1
- Depends on: T1, T2
- Owns: `crates/api/src/orgs/**`, `crates/api/tests/orgs.rs`
- Touches (read-only or additive): `crates/api/src/router.rs`
- Acceptance:
  - [ ] `GET /orgs` lists the 18 local organizations, paginated
  - [ ] non-national roles only see their own organization
- Tests first: `orgs_list_scoped_to_member_org`, `orgs_create_requires_national_admin`
- Notes: follow the repository pattern in `crates/api/src/users/`
```
