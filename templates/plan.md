# <Feature> — Implementation Plan

- Spec: <path>
- Date: YYYY-MM-DD
- Status: draft | approved | in backlog

## Overview
How the spec is cut into tasks and why. Shared foundations first.

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
- Acceptance:
  - [ ] concrete, checkable criterion
- Tests first: `test_name_describing_behavior`
- Notes: patterns to follow, pitfalls

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| | |
