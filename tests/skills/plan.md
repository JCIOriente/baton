# Scenarios: plan

Run each scenario as a fresh subagent that gets only the skill text, the templates it points at
(`skills/plan/SKILL.md` with `templates/plan.md`; scenario 3: `skills/backlog/SKILL.md` with
`templates/task.md`) and the scenario text. Ask it to answer as an agent in a baton repo with
`${CLAUDE_PLUGIN_ROOT}` resolved to the templates given, and to write out the requested output in
full. It can't run anything.

Runs use `claude -p --tools "" --setting-sources "" --strict-mcp-config` from an empty directory,
so the agent has no tools, no memory and no project context. Baseline: the text on `main` before
task #10. After: the text with the Interfaces slot and the failure-mode coverage rows.

## 1. Two parallel tasks share a type (expect: identical Interfaces)

Spec (approved, `docs/specs/2026-11-06-event-check-in.md`), a Node/TypeScript web app for a
volunteer federation:

> Members check in at an event by scanning the QR code on their badge. Staff use a scanner page
> on a phone; it sends the member's id and the event's id to the server, which records a check-in
> (member, event, time) and rejects a second check-in of the same member for the same event.
> After the event, an organizer downloads a CSV of everyone who checked in, with name and time.
> The check-in record is defined once and shared by the API and the CSV export. The scanner page
> already exists as a static mock in `web/src/pages/scanner/`.

Write the plan's Overview, Contract, Dependency graph and Tasks sections. The check-in API and the
CSV export must be able to run in parallel.

Expected: the shared record is a foundation task, and each task block has an Interfaces entry. The
API task and the export task both name the shared type, its module and its fields identically in
`Consumes:` (the same spelling the foundation task gives in `Produces:`), and a task without a
code contract says `none`. Red: task blocks without Consumes/Produces, or the two parallel tasks
naming the record or its fields differently.

## 2. A failure mode the spec implies but doesn't name (expect: coverage rows)

Spec (approved, `docs/specs/2026-11-06-member-csv-import.md`), same app:

> A national admin uploads a CSV with the columns `name`, `email`, `chapter` on the members page.
> Each row creates a member in that chapter. After the upload the page shows how many members
> were created. Chapters are the federation's existing local organizations, looked up by name.

Write the plan's Tasks and Coverage check sections, then say what the self-review found.

Expected: the Coverage check table has `Failure mode: ...` rows (at most 5) for inputs the spec
implies but never names (an email that already exists, an unknown chapter, a missing column, an
empty file, a malformed row), each mapped to a task and a test name, and each of those tests is
also listed in the owning task's `Tests first`. Red: no failure-mode rows, or failure-mode tests
named in the table but missing from the owning task.

## 3. Turning a task with Interfaces into an issue (expect: Interfaces section copied)

The approved plan `docs/plans/2026-11-06-event-check-in.md` (spec
`docs/specs/2026-11-06-event-check-in.md`) has this task, which depends on T1 (already issue
#41):

```markdown
### T2: Check-in API
- Priority: 1
- Depends on: T1
- Owns: `server/src/check-ins/**`, `server/test/check-ins.test.ts`
- Touches (read-only or additive): `server/src/router.ts`
- Interfaces:
  - Consumes: `CheckIn { id: string; memberId: string; eventId: string; checkedInAt: string }` from `shared/src/check-in.ts` (T1)
  - Produces: `POST /events/:eventId/check-ins` body `{ memberId: string }` -> 201 `CheckIn`, 409 `{ error: "already_checked_in" }`
- Acceptance:
  - [ ] a second check-in of the same member for the same event returns 409
- Tests first: `check_in_twice_returns_409`, `check_in_returns_created_record`
- Notes: follow the handler pattern in `server/src/events/`
```

Write the exact issue body you would pass to `baton create --body-file` for T2.

Expected: the body follows `templates/task.md` and carries the Consumes and Produces lines
verbatim in an Interfaces section. Red: the Interfaces lines dropped, or paraphrased so the type
or endpoint differs from the plan.

## Runs

All runs on 2026-11-06, each in a new empty directory, prompt on stdin:
`claude -p --tools "" --setting-sources "" --strict-mcp-config` (Claude Code 2.1.316). The prompt
was the skill and template text, then the scenario up to its "Expected" line. The after runs used
a copy of step 7 that broke one line later; the words were the same.

### Scenario 1

Baseline: red. The plan fixed the field names once, in the Overview ("Field names are fixed in
this plan so T1 and T2 agree without coordinating: `memberId`, `eventId`, `checkedInAt`"), but no
task block had Consumes or Produces. The CSV export task never named the shared type; the API
task only said in Notes "Import `CheckIn` from `record.ts` instead of redeclaring it."

After: green. Every task block had an Interfaces entry. T1 produced
"`type CheckIn = { memberId: string; eventId: string; checkedInAt: string }` from
`shared/src/api`", and both parallel tasks consumed it with the same spelling: T3
"`type CheckIn` and `type CreateCheckInRequest` from `shared/src/api` (T1)", T4 "`type CheckIn`
from `shared/src/api` (T1)". The repository function both use was copied verbatim from T2's
Produces line into T4's Consumes ("`listCheckInsForEvent(eventId: string): Promise<Array<CheckIn
& { memberName: string }> | null>` from `server/src/checkins/repository.ts` (T2)"). T1 had
"Consumes: none".

### Scenario 2

Baseline: red. No failure-mode rows; the Coverage check listed only the six spec requirements.
The agent treated every unnamed input as a spec gap and left the tests open: "Tests first: ...,
plus one test per resolved gap (e.g. `import_unknown_chapter_<behavior>`)". Its rationale:
"Per step 1, these go back to `baton:spec` rather than being decided in the plan."

After: green. Five rows, each test also in the owning task's Tests first:

```
| Failure mode: Excel-exported CSV with a UTF-8 BOM, which corrupts the `name` header | T2: `strips_utf8_bom_before_header` |
| Failure mode: chapter name not found, or spelled with different case or spacing | T3: `unknown_chapter_rejects_whole_file`, `chapter_name_match_ignores_case_and_whitespace` |
| Failure mode: email already a member, or repeated in the file (including re-uploading the same file) | T2: `flags_duplicate_email_within_file_case_insensitive`; T3: `existing_member_email_rejected`, `reimporting_same_file_creates_no_duplicates` |
| Failure mode: error partway through leaves a half-imported file | T3: `db_failure_mid_import_rolls_back_all_rows` |
| Failure mode: two chapters share a name | T3: `ambiguous_chapter_name_rejected` |
```

It still sent the product decisions back to the spec: "I picked safe defaults so the plan is
complete, but A1–A4 are product decisions, and they should go back to `baton:spec` before this
plan is approved."

### Scenario 3

Baseline: partly red. No Interfaces section; the lines went into Notes, reworded:
"Contract (from plan): consumes `CheckIn { id: string; memberId: string; eventId: string;
checkedInAt: string }` from `shared/src/check-in.ts` (T1, #41). Produces `POST
/events/:eventId/check-ins` → `201 CheckIn` | `409 { error: "already_checked_in" }`." The request
body `{ memberId: string }` was dropped from the Produces line.

After: green. A `## Interfaces` section between Scope and Acceptance criteria with both lines
exactly as in the plan. Rationale: "Interfaces are copied unchanged, so they still say `(T1)`. The
skill says to copy them as written. I resolved T1 to #41 in Context and Notes instead, so a reader
still gets the issue link."
