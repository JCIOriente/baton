# <Feature> — Implementation Plan

- Spec: <path>
- Date: YYYY-MM-DD
- Status: draft | approved | in backlog

## Overview
How the spec is cut into tasks and why. Shared foundations first.

## Contract
API/contract changes this plan introduces, and the task that owns them (e.g. T1 updates
`openapi.yaml`). Frontend and backend tasks depend on that task, not on each other.
Write "none" if the plan has no contract changes.

## Impact (risky changes only: schema, auth/permissions, public API, shared modules)
- Affected call paths / consumers:
- Data and migrations (expand -> migrate -> contract steps):
- Tests and downstream checks that must stay green:
- Rollout and rollback:

## Dependency graph
```
T1 ──> T3 ──> T5
T2 ──> T3
T4 (independent)
```
Can start immediately in parallel: T1, T2, T4

## Tasks

### T1: <title>  (#issue once created)
- Priority: 0-3
- Depends on: none
- Owns: `path/**`
- Touches (read-only or additive): `path`
- Interfaces (exact names, signatures, types or endpoints, no bodies; `none` for docs, skill
  text or config):
  - Consumes: `name(arg: Type): Return` from `path` (T<N>), spelled as T<N>'s Produces line
  - Produces: `name(arg: Type): Return`, `METHOD /path` -> `Type`: what later tasks rely on
- Acceptance:
  - [ ] concrete, checkable criterion
- Tests first: `test_name_describing_behavior`
- Notes: patterns to follow, pitfalls

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| | |
| Failure mode: <input or condition> | <task>: `<test name>` |

Failure-mode rows: the inputs or conditions the spec implies but no task tests yet, at most 5,
the most likely first. One input or condition per row, never two joined by "or" or a list in
parentheses: the cap counts failure modes, not rows. Add each test to the owning task's Tests
first. The spec's silence on an input is not permission to break; an empty set means you checked.
