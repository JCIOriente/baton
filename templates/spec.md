# <Feature> — Spec

- Status: draft | approved | superseded by <path> (never rewrite an approved spec; supersede it)
- Date: YYYY-MM-DD
- Owner: <name>
- Related: <links to issues, prior specs>

## TL;DR
- 3-5 bullets: what changes, for whom, and the key decision.

## Change in a nutshell
The most important change, shown concretely first (a screen, an endpoint, a config fragment),
then generalized. A reader who stops here should know what will be different.

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

## FAQ
### Why this approach rather than <alternative>?
One question per subsection, so each can be linked from discussions.

## Open questions
None at approval time. Resolve them or move them to non-goals.

## Implementation status
Updated by the PRs that implement this spec (link the plan and issues once they exist).
- [ ] <step / task #N>
