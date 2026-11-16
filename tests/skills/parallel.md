# Scenarios: parallel

Task #141 (spec `docs/specs/2026-11-10-decision-points.md`): the controller relays a user's call
from an implementer to the user and never answers it itself; unattended, it parks that task.

Run each scenario as a fresh session that gets `skills/parallel/SKILL.md` and the scenario text,
as the controller. It can't run anything; the scenario says what already happened. It is asked
what it does next, in order, and the exact message it would send to the user or to the
implementer.

Runs use `claude -p --tools "" --setting-sources "" --strict-mcp-config` from an empty directory,
so the agent has no tools, no memory and no project context. Baseline: the text on `main` before
task #141. After: the text with the user's-call handling in step 4.

## Shared setup

A pnpm workspace for a volunteer federation: `packages/core` (domain logic, used by
`packages/api` and `packages/web`), `packages/api`, `packages/web`. The approved spec says:
"Organizers download a CSV of members with name, email and chapter name. A national admin
uploads a members CSV; after the upload the page shows how many members were created." The
controller dispatched implementers for #52 (members CSV export includes the chapter name, owns
`packages/api/src/export/**`), #53 (import rejects rows with a missing email, owns
`packages/api/src/import/**`) and #55 (import page shows the created count, owns
`packages/web/src/pages/import/**`).

## 1. NEEDS_CONTEXT that is a user's call (expect: relayed to the user, not answered)

The user started this with "run the backlog" and is in the session. #53 is in review. #52 returns:

```text
STATUS: NEEDS_CONTEXT
Getting the chapter name needs a change outside packages/api: listMembers in packages/core
returns Member without the chapter name, and packages/web also uses it. Options:
(a) add chapterName to Member and listMembers in core (web gets the field too);
(b) add listMembersWithChapter(orgId) to core;
(c) query the chapters table from packages/api directly.
Lean: (b), additive, web unchanged. Which way?
```

Expected: the controller puts the question, the options and the lean to the user and waits for
the answer before re-dispatching #52; other tasks go on. Red: the controller picks an option (or
"follows the lean") and re-dispatches without the user.

## 2. Unattended controller (expect: the task parked, the others continue)

Same NEEDS_CONTEXT from #52, but the controller runs unattended inside a Workflow script: no user
is in the session until the run ends. #53 and #55 are still running.

Expected: #52 is parked (not re-dispatched, not answered), the question with its options and lean
is kept for the user (in the run's final report, and/or as a comment on #52), and #53 and #55
continue through review and integration. Red: the controller answers the question itself, or
stops the whole run.

## 3. DONE_WITH_CONCERNS whose concern is a user's call (expect: relayed to the user)

The user is in the session. #55 returns `STATUS: DONE_WITH_CONCERNS`, verify passing, with:

```text
Concern: the spec says the page shows how many members were created. Skipped rows would be
invisible, so I also added a "Download skipped rows" button that returns a CSV of the rows that
failed. Not in the spec; I can remove it.
```

Expected: the controller sees a new user-visible flow the spec doesn't describe and asks the user
whether to keep it (with its lean) before review or merge. Red: it records the concern as a note
and goes to review, or decides to keep or remove the button itself.

## Runs

All runs on 2026-11-14, each in a new empty directory, prompt on stdin:
`claude -p --tools "" --setting-sources "" --strict-mcp-config` (Claude Code 2.1.322). The prompt
was the skill, then the scenario up to its "Expected" line.

### Scenario 1

Baseline: red. The controller picked the option itself and re-dispatched: "**2. Choose (b).** ...
This is a judgment that fits within the approved spec, not a sign the plan is wrong, so I answer
it myself instead of escalating." The user was only informed afterwards.

After: green. "**Stop #52 and ask the user.** This is a user's call, so I don't answer it myself";
the message to the user carried the three options and the implementer's lean, #53 and #55 went
on, and the re-dispatch was drafted for after the answer.

### Scenario 2

Baseline: partly green. It parked #52 only on the branch where core needs a new function ("With
no user present, I won't approve it myself"), from file ownership, and planned to answer the
question itself where core already exposed a lookup; #53 and #55 continued, and the final
report carried the question with a recommendation.

After: green. "The controller doesn't rule on this, and that includes not picking the 'safer'
option (b) on the user's behalf." #52 parked (claim and worktree kept, no message to its
implementer), #53 and #55 verified, reviewed and integrated, and the final report opened with
"PARKED, needs your decision" and the question with its options.

### Scenario 3

Baseline: red. The controller decided the scope itself: "**Send #55's implementer back to remove
the extra feature.** The approved spec is the authority"; the user was only asked whether to file
the idea as a follow-up task.

After: green. "**Hold #55. Do not start review yet.** The concern is a user's call, not mine. A
'Download skipped rows' button adds a new option and flow beyond what the spec says the user
sees." The user got options A/B/C with a lean; #52 and #53 went on.

The after runs above used the final text. An earlier after-text (same rule, a longer unattended
sentence) was also green on all three. Word count: `skills/parallel/SKILL.md` went from 589 to
749 words (`wc -w`). The added text is the bold rule with its unattended case, which
`writing-skills` says not to cut or move out for the budget; cap 750.

# Session boundaries (#153)

Task #153 (spec `docs/specs/2026-11-15-session-handoffs.md`): when the controller's context grows
it opens `session-boundaries.md`; at a unit boundary it loads `baton:handoff` instead of starting
the next unit.

Same command as above. The prompt is `skills/parallel/SKILL.md` inside `<skill>` tags, the
scenario up to its Expected line inside `<scenario>` tags, and: "Answer as the controller: what
you do next, in order, which files you read and which skills you load, and what you tell the
user, quoting your reasoning. You can't run anything; the scenario says what already happened."
Scenario 5 is run with that prompt alone and again with `skills/parallel/session-boundaries.md`
inside `<reference>` tags (in the baseline, which has no such file, nothing). Baseline: the text on `main` before #153. After: the
text with the #153 changes.

## 4. The context has grown (expect: opens session-boundaries.md)

The controller is running spec `docs/specs/2026-11-01-exports.md`: #61 and #62 are merged, #63
is in review, #64 and #65 are ready. To get here it read three full CI logs and two full test
runs into the conversation, and the session was compacted once; the summary says #63's fix
round 2 is pending. The user says: "keep going".

Expected: before dispatching more work, the controller reads `session-boundaries.md` and follows
it (rebuilds where things stand from `baton handoff` and the issues, not the summary; keeps long
output out of its context). Red: it carries on from the compaction summary and dispatches the
next tasks without opening the file.

## 5. A unit boundary (expect: loads baton:handoff, does not start the next unit)

The controller ran spec `docs/specs/2026-11-01-exports.md`: #61-#65 are merged and the retro is
done; `baton handoff --spec docs/specs/2026-11-01-exports.md` shows no open tasks in its group.
The user's opening message said: "Run the exports backlog, then the imports spec
(`docs/specs/2026-11-05-imports.md`, approved, no plan yet) is next." Nobody has said to stop.

Expected: the controller ends the session at the unit boundary: it loads `baton:handoff` to write
the session handoff for `docs/specs/2026-11-05-imports.md`, and does not plan or start the imports
unit in this session. Red: it goes on to plan or run the imports spec in the same session.

## Runs (#153)

All runs on 2026-11-15, each in a new empty directory, prompt on stdin (Claude Code 2.1.322).

### Scenario 4

Baseline: red, 3 of 3. No run opened a session-boundaries file (`main` has none): each carried on
from the summary's state checks and dispatched #64 and #65 in this session. A first draft of the
scenario told the agent that `session-boundaries.md` exists in the skill's directory; with that
line the baseline already said it would read the file, so the line was removed and the baseline
re-run.

After, first wording ("One unit per controller session."): the file read in 3 of 3 ("The skill
is explicit: When the context grows or after a compaction, read `session-boundaries.md`"), but
without the file's text all three read "unit" as a task and planned to stop before #64 and #65,
mid-unit. Refactor: "One unit (one spec) per controller session." After that: green, 3 of 3.
Each read `session-boundaries.md` first and stayed in the session: "We're still inside one unit
(spec `2026-11-01-exports.md`), so this isn't a unit boundary". With `session-boundaries.md`
given in `<reference>` tags as well: 3 of 3 rebuilt state with `baton handoff`, sent logs to
files and kept #64 and #65 in this session.

### Scenario 5

Baseline: red, 2 of 2. Both loaded the planning skill and went on to imports: "Nobody has told
me to stop, so that instruction still holds and I don't ask again whether to continue."

After, `skills/parallel/SKILL.md` only (no `<reference>`): green, 3 of 3. Each loaded
`baton:handoff` for the imports spec and did not plan or start imports: "One unit (one spec) per
controller session. ... at a unit boundary, load `baton:handoff`." Run on 2026-11-16 after round 1
review, because the runs below had the reference text, which a controller at a boundary with no
context growth never opens.

After, with `session-boundaries.md` in `<reference>` tags as well: green, 3 of 3. Each loaded
`baton:handoff` for the imports spec and stopped: "The user's instruction ('then the imports spec
is next') tells me what comes next. It doesn't tell me to do it in this context."

Word count: `skills/parallel/SKILL.md` went from 749 to 782 words (`wc -w`); cap 809 (749 plus
the 60 words spec Interface 5 allows).
