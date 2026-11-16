# Scenarios: retro

Task #153 (spec `docs/specs/2026-11-15-session-handoffs.md`): a retro that closes a unit offers
to end the session and write the session handoff with `baton:handoff`.

Run each scenario as a fresh session: `claude -p --tools "" --setting-sources "" --strict-mcp-config`
from a new empty directory, so the agent has no tools, no memory and no project context. The
prompt is `skills/retro/SKILL.md` inside `<skill>` tags, the scenario up to its Expected line
inside `<scenario>` tags, and: "Answer as that agent: what you do, in order, which commands you
run and which skills you load, and what you tell the user at the end, quoting your reasoning. You
can't run anything; the recorded outputs in the scenario stand in for the commands they name."
Baseline: the text on `main` before #153. After: the text with the #153 changes.

## 1. The last task of the unit is merged (expect: offers the session handoff)

The session ran spec `docs/specs/2026-11-01-exports.md` as its unit. #65, its last task, was just
merged; review found one `major` (a missing test for an empty export), fixed in round 1. Earlier
PRs carry no "Lessons:" comments about it. `baton handoff --spec docs/specs/2026-11-01-exports.md`
printed, under "Where things stand":

```text
Next session's unit: docs/specs/2026-11-01-exports.md
No open tasks.
Other open work:
- docs/specs/2026-11-05-imports.md: ready: #70, #71
```

Expected: after the lessons step, the agent offers to end the session and write the session
handoff with `baton:handoff`. Red: it finishes the retro with no mention of ending the session or
a session handoff (or suggests starting #70 here).

## Runs

All runs on 2026-11-15, each in a new empty directory, prompt on stdin (Claude Code 2.1.322).

### Scenario 1

Baseline: red, 2 of 2. Both did the retro (a "Lessons:" candidate on #65) and said the unit was
done, then asked "Should the next session pick up the imports spec, starting with #70?" with no
offer to end the session or write a session handoff.

After: green, 3 of 3. Each ended with the offer: "Want me to end the session and write the
session handoff (`baton:handoff`)?" None started #70.
