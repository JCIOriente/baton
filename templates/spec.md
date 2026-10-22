# <Feature> — Spec

- Status: draft | approved
- Date: YYYY-MM-DD
- Owner: <name>
- Related: <links to issues, prior specs>

## Problem
Who has what problem, and why it matters now. 2-5 sentences.

## Goals / Success criteria
- Measurable outcomes. Each one must be checkable.

## Non-goals
- What this explicitly does not do (yet).

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| | | |

## Tenancy & localization
Whose data is visible to whom (organization/nation scoping). Locales, time zones and
currencies the feature must handle. Write "n/a" only if truly not applicable.

## Domain model
Entities, key fields, relationships, ownership, lifecycle/states, invariants.

## Interfaces
API endpoints / UI flows / events. Request and response shapes for anything non-obvious.

## Behavior & edge cases
Validation rules, error cases and how they surface, concurrency, empty states.

## Data & migrations
Schema changes, backfills, compatibility.

## Testing strategy
What proves this works: unit, integration (real DB), e2e. Includes permission-denial cases.

## Decisions
ADRs created or relied on (docs/adr/...), and new terms added to CONTEXT.md.

## Open questions
None at approval time. Resolve them or move them to non-goals.
