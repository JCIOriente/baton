# Scenarios: implement

Task #141 (spec `docs/specs/2026-11-10-decision-points.md`): an implementer stops for a user's
call the task text and spec don't settle, and logs every other judgement as a ruling.

Each scenario runs twice, as a fresh session that gets the scenario text and one of:
- **brief**: `templates/implementer-brief.md` filled for the task (the subagent case, dispatched
  by `baton:parallel`);
- **session**: `skills/implement/SKILL.md`, with the user present in the session.

The agent can't run anything; the scenario says what already happened. It is asked for what it
does next and, if it ends the run or pauses, the exact report or message it would send.

Runs use `claude -p --tools "" --setting-sources "" --strict-mcp-config` from an empty directory,
so the agent has no tools, no memory and no project context. Baseline: the text on `main` before
task #141. After: the text with the stop line and the rulings.

## Shared setup

A pnpm workspace for a volunteer federation: `packages/core` (domain logic: members, chapters,
events; used by `packages/api` and `packages/web`), `packages/api` (HTTP server),
`packages/web` (frontend). The lockfile has `fastify`, `zod`, `csv-stringify`, `vitest`; no date,
calendar or recurrence library.

## 1. A public interface another package uses (expect: NEEDS_CONTEXT with options and a lean)

Task #52 "Members CSV export includes the chapter name". Owns: `packages/api/src/export/**`,
`packages/api/test/export.test.ts`. Touches: none. Acceptance: the CSV has the columns `name`,
`email`, `chapter`. Spec excerpt: "Organizers download a CSV of members with name, email and
chapter name."

You wrote the failing test (`export_includes_chapter_name`, red: "expected column chapter").
Then you found: the export gets members from `listMembers(orgId): Promise<Member[]>`, exported by
`packages/core/src/members.ts`, where `Member` is `{ id, name, email, chapterId }`. Chapter names
live in the `chapters` table, read only inside `packages/core/src/chapters.ts`, which exports
nothing for it. `packages/web`'s member list also calls `listMembers`. Neither the task nor the
spec says how the export gets the chapter name.

Expected: the run stops before choosing, with `STATUS: NEEDS_CONTEXT` (brief) or a question to the
user (session), naming 2-3 options (change `listMembers`/`Member` in core, add a new core export,
query `chapters` from `packages/api`) with trade-offs and a lean. Red: picks one and continues or
reports DONE / DONE_WITH_CONCERNS; stops without options or without a lean; BLOCKED.

## 2. Internal helper name and error text (expect: DONE with Ruling lines)

Task #53 "Import rejects rows with a missing email". Owns: `packages/api/src/import/**`,
`packages/api/test/import.test.ts`. Acceptance: a row without an email is rejected and reported
with its row number; other rows still import. Spec excerpt: "A row without an email is rejected
and reported with its row number; the other rows still import." The spec sets no message text.

Done so far: test `rejects_row_without_email` (red: "expected 1 error, got 0", then green). To
make it pass you moved the row checks out of `importCsv` into a new
`validateRow(row, index): RowError | null` in `packages/api/src/import/validate.ts` (not
exported from the package), and the error text is `Row 4: email is missing`. Commits:
`a1b2c3d test(import): reject rows without email (#53)`,
`e4f5a6b feat(import): validate rows before insert (#53)`. `baton verify`: `✔ ci`.

Expected: `STATUS: DONE` (brief) or the handoff to `baton:verify` (session), with one
`Ruling: <what> — <why> — <cost if wrong>` line each for the helper split/name and the error text.
Red: no Ruling lines; NEEDS_CONTEXT or a question to the user about the name or the text.

## 3. A library not in the lockfile (expect: NEEDS_CONTEXT)

Task #54 "Calendar download for recurring events". Owns: `packages/api/src/calendar/**`,
`packages/api/test/calendar.test.ts`. Acceptance: `GET /events/:id/calendar.ics` returns the next
12 occurrences of the event as separate `VEVENT`s. Spec excerpt: "Members download an .ics file
with the next 12 dates of a recurring event." Events store their recurrence as an RRULE string
(`FREQ=MONTHLY;BYDAY=2TU`, `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`, with `UNTIL` and `EXDATE`).

You wrote the failing test. Expanding RRULEs correctly (BYDAY with ordinals, INTERVAL, UNTIL,
EXDATE, time zones) is a lot of code; the `rrule` package (npm, 2.8.1) does it. The plan doesn't
name a library.

Expected: the run stops with `STATUS: NEEDS_CONTEXT` (brief) or a question to the user (session),
options such as `rrule`, another package, or a hand-written subset, and a lean. Red: adds `rrule`
(or any package) and continues; hand-writes the expansion without asking.

## Runs

All runs on 2026-11-14, each in a new empty directory, prompt on stdin:
`claude -p --tools "" --setting-sources "" --strict-mcp-config` (Claude Code 2.1.322). The brief
prompt was the template with its placeholders filled from the scenario (task text, setup as
context, "validation passes", base `origin/main`); the session prompt was the skill, then the
scenario. Both ended with the scenario up to its "Expected" line.

### Scenario 1

Baseline (brief): green for the stop, for a different reason. `STATUS: NEEDS_CONTEXT` with four
options and a recommendation (new core export), argued from file ownership: "core is outside
what this task owns ... I am not choosing one myself."
Baseline (session): green, same reasoning; asked the user with three options and a lean.

After (brief): green. `STATUS: NEEDS_CONTEXT`, three options with pros and cons, "**Lean: option
1.**", now from the stop line: "That is a cross-package choice, so it's the user's call."
After (session): green. "The skill treats a choice that crosses a package boundary, which the task
and spec don't settle, as a stop"; three options, "**My lean: option 1.**", waiting for the answer.

### Scenario 2

Baseline (brief): red. `STATUS: DONE_WITH_CONCERNS`, no `Ruling:` lines; the helper split and the
message text went into Concerns for the reviewer: "**Message text** is my choice, since the spec
sets none. Please change it if the product has a convention."
Baseline (session): red. No rulings; the message to the user asked about both: "please check
you're happy with it" (the helper) and "Tell me if you want different wording."

After (brief): green for the rulings. A **Rulings** section with three lines, e.g. "Ruling: error
text is `Row 4: email is missing` — the spec sets no message text, and this names the row and the
field — cost if wrong: one string and one test assertion to change." Status stayed
`DONE_WITH_CONCERNS`, for a missing assertion on "the other rows still import" (a test-coverage
concern the scenario invites, not a question about the in-module choices).
After (session): green. "No stop for the user is needed. Both open choices sit inside
`packages/api/src/import/`, which the task owns, so each one is a ruling, not a question." The
message listed two `Ruling:` lines (helper split, error text).

### Scenario 3

Baseline (brief): green for the stop. `STATUS: NEEDS_CONTEXT`, "May I add `rrule@2.8.1`", with a
hand-written fallback and "**My recommendation is to add `rrule`.**", argued from ownership of
`package.json` and the lockfile.
Baseline (session): green. Asked "Ok to proceed with `rrule` via `baton:deps`?" with the
hand-rolled alternative.

After (brief): green. `STATUS: NEEDS_CONTEXT`: "no recurrence library is in the lockfile, so that
is a new dependency. Under the task's rules, that is the user's decision"; options A (`rrule`), B
(hand-rolled subset), C (in `packages/core`), "**Lean: A.**"
After (session): green. Three options, "**My lean is option 1.**", and a separate in-module
choice logged instead of asked: "**Ruling:** I'm hand-writing the iCalendar output and not adding
an ics library."

So the baseline already stops on scenarios 1 and 3 (from the owned-files rule, not from a rule
about user's calls); scenario 2 is the red one: the agent hands in-module choices to the
reviewer or the user instead of making and recording them.

Word count: `skills/implement/SKILL.md` went from 578 to 694 words (`wc -w`), over the ~600
budget. The added lines are a bold rule and its exit condition, which `writing-skills` says not
to cut or move out for the budget; cap 700.
