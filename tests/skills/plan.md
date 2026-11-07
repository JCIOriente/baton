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
API task and the export task both name the shared type and its module identically in
`Consumes:` (the same spelling the foundation task gives in `Produces:`); the fields are defined
once, in the producer's line, and a consumer that repeats them repeats them exactly. A task
without a code contract says `none`. Red: task blocks without Consumes/Produces, or the two
parallel tasks naming the record, its module or any field they list differently.

## 2. A failure mode the spec implies but doesn't name (expect: coverage rows)

Spec (approved, `docs/specs/2026-11-06-member-csv-import.md`), same app:

> A national admin uploads a CSV with the columns `name`, `email`, `chapter` on the members page.
> Each row creates a member in that chapter. After the upload the page shows how many members
> were created. Chapters are the federation's existing local organizations, looked up by name.

Write the plan's Tasks and Coverage check sections, then say what the self-review found.

Expected: the Coverage check table has `Failure mode: ...` rows (at most 5) for inputs the spec
implies but never names (an email that already exists, an unknown chapter, a missing column, an
empty file, a malformed row), one input or condition per row, each mapped to a task and a test
name, and each of those tests is also listed in the owning task's `Tests first`. Red: no
failure-mode rows, failure-mode tests named in the table but missing from the owning task, or a
row that bundles two or more inputs or conditions (that slips more than five past the cap).

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
verbatim in an Interfaces section, except that the producer reference `(T1)` becomes `(#41)`, so
an implementer who sees only the issue can find it. Red: the Interfaces lines dropped, paraphrased
so the type or endpoint differs from the plan, or still pointing at `(T1)`.

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

## Re-run after review (2026-11-06)

Review found that `baton:backlog` step 3 ("copy ... unchanged") and the `(#<issue>)` example in
`templates/task.md` disagreed, so the plan's `(T1)` reached the issue unresolved. It also found
that scenario 2 had no way to catch rows that bundle several failure modes and so slip past the
cap of five. Scenarios 2 and 3 gained those red conditions. Step 3 now says
"unchanged except that each `(T<N>)` becomes its issue number from the map", the task template's
placeholder says the same, and the plan template's failure-mode note now reads "One input or
condition per row, never two joined by "or" or a list in parentheses: the cap counts failure
modes, not rows." Same command and prompt shape as above (Claude Code 2.1.316), each run in a
new empty directory.

Scenario 1 was re-graded, not re-run. Its Expected line used to require the consumers to repeat
the fields. Neither the issue's Decision 6 ("name it identically") nor the template asks for
that: the fields are defined once, in the producer's line. Expected now asks for the same type
name and module, and asks that any field a consumer repeats match exactly. The recorded after
run meets that (T3 and T4 both say "`type CheckIn` ... from `shared/src/api` (T1)", and neither
repeats a field), so it stays green.

### Scenario 2

Red (text before this review): bundled rows. Five rows covering eight failure modes, three of them bundled:

```
| Failure mode: email already a member, or repeated in the file | T2: `test_import_existing_member_email_rejected`, `test_import_duplicate_email_in_file_rejected` |
| Failure mode: header missing a column or in a different order | T2: `test_import_rejects_missing_column`, `test_import_header_order_and_whitespace_tolerated` |
| Failure mode: invalid email or blank name in a row | T2: `test_import_invalid_email_rejected`, `test_import_blank_name_rejected` |
```

The earlier recorded after run (above) is red under the new Expected for the same reason.

First green attempt, with only "one per row" added to the note: still red. Five rows, three of
them bundled, e.g. "| Failure mode: wrong/missing header, empty or header-only file | T2:
`test_rejects_missing_header`, `test_rejects_empty_file`, `test_header_only_is_invalid_file` |"
and "| Failure mode: spreadsheet export quirks (BOM, CRLF, quoted commas, chapter name with
different case or spaces) | ... |".

Green (final text): five rows, one condition each, and every test also in the owning task's
Tests first:

```
| Failure mode: chapter name matches no chapter | T3: `test_import_unknown_chapter_creates_no_member` |
| Failure mode: email already belongs to a member | T3: `test_import_existing_email_does_not_create_duplicate` |
| Failure mode: caller is a chapter admin | T3: `test_import_as_chapter_admin_returns_403` |
| Failure mode: same email twice in one file | T3: `test_import_duplicate_email_within_file_creates_one_member` |
| Failure mode: required column missing | T2: `test_parse_missing_email_column_raises_csv_format_error` |
```

The rest went into the self-review instead of more rows: "**Less likely failure modes left out by
the five-row cap:** invalid email format, empty file, blank `name`, non-UTF-8 encoding, and quoted
commas in names."

### Scenario 3

Red (text before this review): the Interfaces section was copied exactly, `(T1)` included:
"- Consumes: `CheckIn { id: string; memberId: string; eventId: string; checkedInAt: string }` from
`shared/src/check-in.ts` (T1)". Rationale: "**Interfaces** is copied unchanged from the plan, as
the skill requires. That is why it still says `(T1)` and not `#41`. I mapped T1 → #41 in Context
and Notes so a reader without context can resolve it."

Green: "- Consumes: `CheckIn { id: string; memberId: string; eventId: string; checkedInAt: string
}` from `shared/src/check-in.ts` (#41)", and the Produces line unchanged. Rationale:
"**Interfaces**: copied exactly from the plan. The only change is `(T1)` → `(#41)`, as the skill
requires. The `Depends on` value comes from the same map, so it is `--depends-on 41`."

## Re-run after rewrap (2026-11-06, task #89)

Task #89 rewrapped the failure-mode note in `templates/plan.md` near 100 characters; the words
are unchanged. Scenario 2 was re-run against the text before and after, same command and prompt
shape as above (Claude Code 2.1.316), each run in a new empty directory. Scenario 3 was not
re-run: `skills/backlog/SKILL.md` step 3 and the `templates/task.md` placeholder already agree
that each `(T<N>)` becomes its issue number, so neither changed.

### Scenario 2

Before (125-character line): not red; documents behavior. Five rows, one condition each, every
test also in the owning task's Tests first:

```
| Failure mode: chapter name matches no existing chapter | T3: `test_import_row_with_unknown_chapter_creates_no_member` |
| Failure mode: email already belongs to an existing member | T3: `test_import_row_with_existing_email_creates_no_member` |
| Failure mode: same email appears twice in the file | T3: `test_import_duplicate_email_within_file_rejected` |
| Failure mode: required column header missing | T2: `test_missing_chapter_header_returns_missing_columns` |
| Failure mode: required field blank in a row | T3: `test_import_row_with_blank_email_rejected` |
```

After (rewrapped): green, the same shape:

```
| Failure mode: chapter name matches no existing chapter | T4: `test_import_unknown_chapter_creates_no_member_for_row` |
| Failure mode: email already belongs to an existing member | T4: `test_import_existing_email_creates_no_duplicate` |
| Failure mode: same email repeated within the file | T2: `test_parse_repeated_email_in_file_reports_duplicate` |
| Failure mode: required column header missing | T2: `test_parse_missing_email_column_reports_missing_columns` |
| Failure mode: malformed email value | T2: `test_parse_malformed_email_reports_invalid_email` |
```
