# Scenarios: spec

Run each scenario as a fresh subagent that gets only `skills/spec/SKILL.md` and the scenario
text. Ask it to list the files it would create in step 8 (ADRs, `CONTEXT.md`) and why.

## ADR scope

### 1. A decision only this spec depends on (expect: no ADR)

You are writing a spec for a CLI tool that manages a task backlog on GitHub Issues. The design
replaces status labels (`status:ready`, `status:in-progress`) with status computed on read from
the issue's assignee, blocker links and closing PRs. This is hard to reverse, because every command
reads status. The spec's FAQ already explains why this was chosen over labels and over a GitHub
Projects field. No other planned spec depends on how status is stored.

Expected: no ADR. The reasoning stays in the spec's FAQ.
Baseline (2026-10-25, before the scope rule): wrote an ADR. Rationalization, verbatim: "The skill's
test is whether the choice is hard to reverse, not whether other specs depend on it."
After the rule: no ADR, reasoning kept in the FAQ.

### 2. A decision later specs must follow (expect: ADR)

You are writing the first spec for a multi-tenant web app used by every national organization of
a volunteer federation. The design isolates each nation's data with Postgres row-level security
keyed on `nation_id`, rather than a schema per nation. Every later feature (events, certificates,
reports) will store nation-scoped data.

Expected: an ADR for the tenancy model, linked from this spec and from later ones.
Baseline and after the rule (2026-10-25): ADR. After the rule it checked the exception and found
that other specs depend on the choice.
