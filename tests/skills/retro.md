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
Other open work:
- docs/specs/2026-11-05-imports.md: ready: #70, #71
```

Expected: after the lessons step, the agent offers to end the session and write the session
handoff with `baton:handoff`. Red: it finishes the retro with no mention of ending the session or
a session handoff (or suggests starting #70 here).

## 2. The unit still has open tasks (expect: no offer to end the session)

The session runs spec `docs/specs/2026-11-01-exports.md` as its unit. #63 was just merged; review
found one `major` (a missing test for an empty export), fixed in round 1. Earlier PRs carry no
"Lessons:" comments about it. `baton handoff --spec docs/specs/2026-11-01-exports.md` printed,
under "Where things stand":

```text
Next session's unit: docs/specs/2026-11-01-exports.md
- ready: #64, #65
Other open work:
- docs/specs/2026-11-05-imports.md: ready: #70, #71
```

Expected: the agent does the retro and does not offer to end the session or write the session
handoff; the exports unit continues. Red: it offers the session handoff.

## 3. A task with no spec (expect: skips step 5)

#80, a chore issue ("chore(deps): bump vitest"), was just merged. Its issue body has no `Spec:`
line; it belongs to no spec. Review found one `major` (the lockfile was not updated), fixed in
round 1. Earlier PRs carry no "Lessons:" comments about it. The user asks for a retro on #80.

Expected: the agent does the retro and skips step 5: it runs no `baton handoff` and makes no offer
to end the session. Red: it runs `baton handoff` with an invented spec or without `--spec`, or
offers the session handoff.

## Runs

All runs on 2026-11-15 (round 1 re-runs on 2026-11-16), each in a new empty directory, prompt on stdin (Claude Code 2.1.322).

### Scenario 1

Baseline: red, 2 of 2. Both did the retro (a "Lessons:" candidate on #65) and said the unit was
done, then asked "Should the next session pick up the imports spec, starting with #70?" with no
offer to end the session or write a session handoff.

After, first wording ("When it shows no open tasks in the unit's group"), with a fixture that
also printed `No open tasks.`: green, 3 of 3. Each ended with the offer: "Want me to end the
session and write the session handoff (`baton:handoff`)?" None started #70.

Round 1 review: spec Interface 1 prints `No open tasks.` only when no group has a task, so the
fixture was wrong. With the fixture above (no such line), the first wording went red in 1 of 3:
"Handoff is still naming the exports spec as the next unit, which means baton thinks something in
that group is open". Refactor: "When no task is listed under "Next session's unit" (that heading
only repeats the spec you passed)". After that, final text: green, 8 of 8 (5 with the wording
before the no-spec clause, 3 with the final text; one more run hit an API error and was re-run).
Each offered "Shall I end the session here and write the session handoff (`baton:handoff`)?";
none started #70.

### Scenario 2

Control, the first wording with the condition removed ("Then offer to end the
session"): red, 2 of 2. Both offered "Want me to end the session here and write the handoff
(`baton:handoff`)? Or should I continue with #64?" So the condition is what holds the offer back.

After: green, 6 of 6 (3 with the wording before the no-spec clause, 3 with the final text; one more
run hit an API error and was re-run). For example: "Tasks are still listed there, so the unit is
not done. That means I don't offer to end the session and I don't load `baton:handoff`."

### Scenario 3

Baseline, the text before the round 1 fix ("Run `baton handoff --spec <spec>` for the task's
spec."): red, 1 of 2. Neither invented a spec, but one offered the session handoff anyway: "The
chore is merged, so this unit is closed. Do you want to end the session and write a session
handoff". After the guard alone ("otherwise skip this step"): 1 of 3 still offered ("it's a
standalone unit, and with it merged the unit is done"). Refactor: "otherwise skip this step and
make no offer (a task with no spec closes no unit)". After: green, 3 of 3, for example: "#80 has
no `Spec:` line, so it belongs to no unit. The skill says to skip this step and make no offer."
