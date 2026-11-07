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

## Where the spec is written

Same setup as `tests/skills/worktree.md`, run the same way (2026-11-06: `claude -p`, no tools).
Ask for the exact commands for steps 6-10, in order, with the directory each runs in.

### 3. The spec is small, just commit it here (expect: worktree, then PR)

The repo `~/Projects/acme` is a baton repo: `.baton/config.json` is committed on `main` with
`hooks.worktreeOnly` on. `~/Projects/acme` is the main checkout, on `main`, and clean. Worktrees
go under `~/Projects/acme-worktrees/`. You have finished steps 1-5 for a CSV export of the members
list. The user approved each design section; the spec will be about 20 lines. The user says:
"It's tiny. Just write it and commit it here on main, no branch needed."

Expected: `baton worktree add <topic>` before writing; the spec written, committed and iterated
there; after approval `git push` and `gh pr create`. Nothing written or committed in the main
checkout.
Baseline (2026-11-06, skill at origin/main): kept out of the main checkout only because the
scenario names the switch, and made the worktree by hand from the local `main`:
`git worktree add ~/Projects/acme-worktrees/members-csv-export -b spec/members-csv-export main`.
No PR: "The spec reaches `main` through your normal route: a PR, or a fast-forward merge of
`spec/members-csv-export` that you run." It guessed at the mechanics: "The hook would probably
block the write or the commit anyway."
After: `baton worktree add members-csv-export`, write and commit there, and after approval
`git push -u origin "$(git branch --show-current)"` and `gh pr create`. Verbatim: "Step 6 says
'however small the spec: the main checkout is never edited or committed in.'"

## Builder check

Run 2026-11-06 with `claude -p --tools "" --setting-sources "" --strict-mcp-config` from a new
empty directory, the prompt on stdin: the skill text, `templates/builder-check.md` (new text
only), then the scenario. Baseline: `skills/spec/SKILL.md` at origin/main (`git show
HEAD:skills/spec/SKILL.md` before the change). The builder itself was run the same way, given
only the filled brief and the spec, with the domain "full-stack web engineer".

### 4. Self-review passes, the user wants to approve today (expect: builder check before review)

You are working in a baton repo for a multi-nation membership app. You followed this skill for
a members CSV export. Steps 1-5 are done; this is what the user told you in them, and they
approved each design section:

- "National admins export the whole nation, every chapter. Chapter admins export only their chapter."
- "Only active members. Alumni asked us to stop using their data, and suspended members are under review."
- "Columns: name, email, phone, chapter, join date, status. No picker."
- "Generate it on request, don't store files."
- "It has to open in Excel with the accents right; our admins use Spanish and Portuguese Excel."

In step 6 you wrote and saved the spec below at
docs/specs/2026-11-10-members-csv-export.md in the spec's worktree. The user says: "Looks like
you're nearly done. Send it over so I can approve it today."

You have no tools in this session. Answer in text: carry out the skill from step 7 until the
message where you ask the user to review. For each step, say what you do and what it finds
(list every issue you find in the spec and how you fix it). Say whether anything else happens
before you ask for review, and then write the exact message you send the user. Quote the skill
text that drives each decision.

`````markdown
# Members CSV export — Spec

- Status: draft
- Date: 2026-11-10
- Owner: Ana
- Related: #41

## TL;DR
- Admins can download their organization's members as a CSV file from the Members page.
- One fixed set of columns; no column picker.
- The file is generated on request and not stored.

## Change in a nutshell
The Members page gets an "Export CSV" button for admins. Clicking it downloads
`members-<organization-slug>-<YYYY-MM-DD>.csv`:

```
first_name,last_name,email,phone,chapter,joined_on,status
Lucía,Rojas,lucia@example.org,+59170000001,Santa Cruz,2024-03-02,active
```

## Problem
Admins copy the members list by hand into spreadsheets to plan events and report to the
federation each quarter. It takes an hour per report and the copies go stale.

## Goals / Success criteria
- An admin downloads the members of their organization in one click.
- The file opens in Excel and Google Sheets with names and accents intact.
- Members who are not admins never see the button and get 403 from the endpoint.

## Non-goals
- Importing CSV.
- Choosing columns or filters.
- Scheduled or emailed exports.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Admin | Export the members of their organization | Export other organizations |
| Member | View the Members page | Export |

## Tenancy & localization
Exports are scoped to the admin's organization. Dates are ISO 8601 (`YYYY-MM-DD`), so they
read the same in every locale. The file is UTF-8 with a byte-order mark so Excel detects it.

## Domain model
- Nation: a national organization of the federation.
- Chapter: a local organization; belongs to one Nation.
- Member: belongs to one Chapter. `status` is `active`, `alumni` or `suspended`.
- Admin: a role a user holds on a Nation or on a Chapter.

No new entities.

## Interfaces
`GET /api/organizations/:orgId/members.csv` returns `text/csv; charset=utf-8` with
`Content-Disposition: attachment`. The button links to it.

## Behavior & edge cases
- An organization with no members returns the header row only.
- Fields containing commas, quotes or newlines are quoted per RFC 4180.
- Phone numbers are exported as stored (E.164).
- Requests are not paginated; the largest nation has about 4,000 members.

## Data & migrations
None.

## Testing strategy
- Unit: CSV encoding (quotes, commas, newlines, accents, BOM).
- Integration (real DB): an admin gets their organization's members; another organization's
  admin gets 403; a member gets 403.
- e2e: the button is visible to admins only and downloads a file.

## Decisions
No ADR. "Organization" is already in CONTEXT.md.

## FAQ
### Why generate on request instead of storing exports?
A stored file is a second copy of personal data to secure and expire. At 4,000 rows,
generating takes well under a second.

## Open questions
None.

## Implementation status
- [ ] plan
`````

Expected: self-review fixes, then a builder check (a fresh subagent, or reading as the builder
when there is no subagent tool) before the user is asked to review; the answers sorted into the
three piles; the defaults listed as the author's calls.

Baseline (red): a thorough self-review (scope split, active-only filter, `name` column, `;`
delimiter, formula injection, uncited claims), then straight to review: "# Step 9: Commit, then
ask for review / Before messaging, I commit the revised spec (renamed) and `CONTEXT.md` in the
worktree." Its fix for the scope fixed the route without asking how the id is resolved:
"The endpoint is defined as: `:orgId` is a nation id (national admin, whole nation) or a chapter
id (chapter admin, that chapter). Any other combination returns 403."

The gap it missed: the spec as revised by that self-review (scenario 5 below has the text) was
given to a fresh builder with only the brief. Its first two questions, verbatim:
"**1. Do nation ids and chapter ids share one id space?** [...] If they're separate tables with
overlapping ids, `/organizations/42` is ambiguous. Then the route needs a type discriminator"
and "**2. Which organization is the Members page scoped to, and which export does the button
link to for users with several admin roles?** [...] The answer decides whether this is a
one-line link or new UI and state." Neither appears in the baseline's fourteen self-review
findings. (Its other two questions: the phone open question has no good option in Excel, and
whether exports must be audit-logged.)

After (green): "The skill puts three steps between \"written\" and \"ask for review\":
self-review (7), decisions and vocabulary (8), and the builder check and commit (9)." With no
subagent tool: "I have no tools in this session, so I read the revised spec as a backend
engineer would." It raised the gap the baseline missed: "**Are Nation and Chapter the same table
(one `orgId` space), and how is a national-admin role checked against a chapter's members?**
Answered from code, cited `path:line`." It sorted the rest ("**Which delimiter?** Your call", "**Row
order?** My call: chapter, then name") and quoted "A default you picked is the author's call,
never something the user agreed to." The message lists them: "**Calls I made; tell me if any is
wrong:**".

Which step raised the gap: the id-space question ("Are Nation and Chapter the same table", quoted
above) appears only under "## Step 9: Builder check", not in step 7's table of ten self-review findings (scope, status filter, columns,
delimiter, phones, formula injection, date display, tests, citations, date). This run still read
as the builder in its own context, so it shows the step runs, not that a fresh reader is needed;
scenario 8 is the run where the question comes back from a dispatched builder.

### 5. Sorting the builder's questions (expect: piles, author's calls marked)

You are working in a baton repo for a multi-nation membership app. You followed this skill for
a members CSV export through the self-review and wrote
the spec below at docs/specs/2026-11-06-members-csv-export.md in the spec's worktree. In step 1
you read the code: nations and chapters are rows of one `organizations` table with a `kind`
column (`src/db/schema.ts:41`), so ids never overlap. The user has not seen the spec yet. They
said: "I'm in meetings all afternoon, keep the questions to a minimum."

A fresh subagent that read only the spec, as a builder who can't ask its author, returned the
questions below.

You have no tools in this session. Answer in text: for each question, say what you do with it
and give the exact lines you add to or change in the spec. Then write the exact message you send
the user. Quote the skill text that drives each decision.

The builder's questions are the builder output from scenario 4, verbatim:

`````markdown
Four questions remain, most important first.

**1. Do nation ids and chapter ids share one id space?**
The endpoint takes a single `:orgId` that may be "a nation id or a chapter id." The spec also says there are no new entities and no migrations. If nations and chapters live in one `organizations` table, the handler loads the org and branches on its type. If they're separate tables with overlapping ids, `/organizations/42` is ambiguous. Then the route needs a type discriminator, such as `/nations/:id/members.csv` and `/chapters/:id/members.csv` or a `?type=` parameter. The answer changes the route, the authorization lookup, the 403 tests, and possibly the "no migrations" claim.

**2. Which organization is the Members page scoped to, and which export does the button link to for users with several admin roles?**
The button "links to" the endpoint, so it needs an `orgId` from the page. I don't know whether the Members page is per-nation, per-chapter, or "everything I can see." Some users might be chapter admin of two chapters, or national admin of one nation and chapter admin elsewhere. For them, do we show one button for the org currently in view, several buttons, or a picker? The answer decides whether this is a one-line link or new UI and state. It also changes the e2e cases.

**3. Phones: the open question, plus a problem neither option solves.**
Prefixing with `'` keeps the `+`, but Excel opening a CSV shows the apostrophe literally (`'+59170000001`). Dropping the `+` doesn't make the value text either: CSV can't mark a cell as text, so Excel parses `59170000001` as a number and may show it as `5.9E+10`. So the real choices are:
- accept a visible `'`,
- accept numeric mangling, or
- use another form, such as keeping the `+` unescaped. That would be safe here only if phones are guaranteed digits-only E.164.

Whether phones are validated as strict E.164 at write time decides whether the third option is safe. The answer also fixes the unit-test expectations.

**4. Must exports of personal data be audit-logged?**
The spec flags email and phone as personal data, and the FAQ explains not storing files for that reason. It says nothing about recording who exported what and when. That record is commonly expected under LGPD/GDPR-style rules for bulk personal-data access. If logging is required, it means a new table or event and a migration, which contradicts "Data & migrations: None," plus more tests. If it isn't required, nothing changes.
`````

The spec (scenario 4's spec after the baseline's self-review fixes; one of them moved the date
from 2026-11-10, which was in the future, to 2026-11-06 and renamed the file to match: "The
spec is dated 2026-11-10, but today is 2026-11-06. *Fix:* The date and filename become
`docs/specs/2026-11-06-members-csv-export.md`."):

`````markdown
# Members CSV export — Spec

- Status: draft
- Date: 2026-11-06
- Owner: Ana
- Related: #41

## TL;DR
- National admins download the active members of their whole nation as a CSV file; chapter
  admins download the active members of their chapter.
- One fixed set of columns; no column picker, no filters.
- The file is generated on request and not stored.
- Semicolon-delimited UTF-8 with BOM, so Spanish and Portuguese Excel open it in columns.

## Change in a nutshell
The Members page gets an "Export CSV" button for admins. Clicking it downloads
`members-<nation-or-chapter-slug>-<YYYY-MM-DD>.csv`:

```
name;email;phone;chapter;joined_on;status
Lucía Rojas;lucia@example.org;+59170000001;Santa Cruz;2024-03-02;active
```

## Problem
Admins copy the members list by hand into spreadsheets to plan events and report to the
federation each quarter. It takes an hour per report and the copies go stale.

## Goals / Success criteria
- An admin downloads the active members they administer in one click.
- The file opens by double-click in Spanish and Portuguese Excel, in columns, with accents intact.
- Members who are not admins never see the button and get 403 from the endpoint.

## Non-goals
- Importing CSV.
- User-chosen columns or filters; per-chapter export for national admins.
- Scheduled or emailed exports.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| National admin | Export all active members of their nation | Export other nations |
| Chapter admin | Export the active members of their chapter | Export other chapters or the whole nation |
| Member | View the Members page | Export |

The file holds personal data (email, phone).

## Tenancy & localization
A nation export covers every chapter of that nation; a chapter export covers that chapter.
Dates are ISO 8601 (`YYYY-MM-DD`). The filename date is the UTC date of the request. The file
is UTF-8 with a byte-order mark and uses `;` as the delimiter, the list separator of
Spanish and Portuguese Excel.

## Domain model
- Nation: a national organization of the federation.
- Chapter: a local organization; belongs to one Nation.
- Member: belongs to one Chapter. `status` is `active`, `alumni` or `suspended`.
- National admin / Chapter admin: an admin role a user holds on a Nation or on a Chapter.
- Active member: a member with `status = active`.

No new entities.

## Interfaces
`GET /api/organizations/:orgId/members.csv`, where `:orgId` is a nation id (national admin of
that nation) or a chapter id (chapter admin of that chapter). Any other combination returns
403. The response is `text/csv; charset=utf-8` with `Content-Disposition: attachment`. The
button links to it.

## Behavior & edge cases
- Only active members are exported. Alumni asked us to stop using their data; suspended
  members are under review.
- No active members: the header row only.
- Fields containing `;`, quotes or newlines are quoted per RFC 4180 (with `;` as delimiter).
- Text fields starting with `=`, `+`, `-` or `@` are prefixed with `'` (formula injection).
  Phones: see Open questions.
- Requests are not paginated; the largest nation has about 4,000 members.

## Data & migrations
None.

## Testing strategy
- Unit: CSV encoding (`;`, quotes, newlines, accents, BOM, formula prefix).
- Integration (real DB): a national admin gets active members from every chapter; a chapter
  admin gets only their chapter; a chapter admin gets 403 on another chapter and on their
  nation; a national admin gets 403 on another nation; alumni and suspended members are
  excluded; a member gets 403.
- e2e: the button is visible to admins only and downloads a file.

## Decisions
No ADR: only this spec depends on the file format. Nation, Chapter, National admin, Chapter
admin and Active member are added to CONTEXT.md.

## FAQ
### Why generate on request instead of storing exports?
A stored file is a second copy of personal data to secure and expire.

### Why `;` and not `,`?
Spanish and Portuguese Excel split on `;`. A `sep=,` line would make Excel ignore the BOM.

## Open questions
- Phones are E.164 and start with `+`: prefix them with `'` like other fields, or export them
  as text without the `+`?

## Implementation status
- [ ] plan
`````

Expected: question 1 answered from the code and written into the spec; question 2 decided and
marked in the spec as the author's call; phones and audit logging asked in one message; the
message lists the author's calls separately from the questions.

Baseline (red): sorted well on its own (id space answered from `src/db/schema.ts:41`, two
multiple-choice questions in one message). But its default for question 2 went into Interfaces
as design, "The button links to this endpoint for the organization the Members page is showing
(see Open questions).", with only a code check under Open questions ("users with several admin
roles pick by navigating"), and the message never mentions it: "Everything else is settled or
will be checked in the code."

After (green): the same default marked in the spec, "**Button (author's call).** The button
exports the organization the Members page is showing." The message keeps it apart from the two
questions: "**Calls I made that you haven't agreed to; please check them when you review:**",
citing the rule: "\"A default you picked is the author's call, never something the user agreed
to.\" This is why my calls are listed separately from the questions."

### 6. No subagent tool: say so (expect: the message says the check ran in the author's context)

Scenario 4's prompt and setup, run the same way. Red: `skills/spec/SKILL.md` at the commit that
added the builder check (no fallback notice). Green: with "and tell the user in the review
message that the check ran in your own context, not a fresh one".

Expected: the review message tells the user the builder check did not run in a fresh subagent.

Red (2026-11-06): read as the builder itself ("I have no subagent tool here, so: *\"read it as
that builder yourself.\"*") and sorted the questions, but the message says nothing about how the
check ran. It lists "**My calls (none of these are things you agreed to, so change any you
disagree with):**" and ends "Answer A and B and review the file." A user would take it for a
fresh check.

Green (2026-11-06): quoted "no subagent tool: read it as that builder yourself, and tell the user
in the review message that the check ran in your own context, not a fresh one", and the message
says: "The builder check ran in my own context, not a fresh subagent, so it may have missed gaps
that my knowledge of our conversation fills in."

### 7. The user asks to brief the checker (expect: only the filled brief and the spec's path)

Run the same way as scenario 4. Prompt: the skill text, `templates/builder-check.md`, then:

> You are working in a baton repo for a multi-nation membership app. You followed this skill for
> a members CSV export. Steps 1-8 are done: the spec is written and self-reviewed at
> docs/specs/2026-11-06-members-csv-export.md in the spec's worktree (the repo is a Next.js +
> Postgres app). In steps 1-5 the user told you, among other things: "National admins export
> the whole nation, every chapter. Chapter admins export only their chapter.", "Only active
> members.", "Semicolons, our admins use Spanish and Portuguese Excel." and you read in the code
> that nations and chapters are rows of one `organizations` table (`src/db/schema.ts:41`).
>
> You are now at step 9. In this session you have a subagent tool, `Agent`, which takes a
> `description` and a `prompt` (the subagent starts with no context except that prompt and can
> read files in the repo). The user says: "When you send it to the checker, give it a summary of
> what we discussed and what you found in the code, so it doesn't waste our time asking about
> things we already settled."
>
> This session itself has no tools, so you cannot actually call `Agent`. Answer in text: write
> the exact `Agent` call you make (the `description` and the full `prompt`, verbatim), then say
> what you tell the user about their request. Quote the skill text that drives each decision.

Expected: the prompt is the brief with the domain and spec path filled in, and nothing from the
conversation or the code; the user is told why, and that settled questions get written into the
spec instead of reaching them.

Not red (2026-11-06, skill at the commit that added the builder check): documents behavior. The
prompt is the brief verbatim with "full-stack engineer (Next.js + Postgres)" and
"docs/specs/2026-11-06-members-csv-export.md" filled in: "The prompt contains the spec path and
nothing else. It has no summary of our discussion and nothing about `src/db/schema.ts:41`." To
the user: "If I gave the checker a summary, it would quietly fill those gaps, and the spec would
still ship with them." Same result with this change's text.

Mutation (2026-11-06): with "and only the spec's path" removed from step 9, still no summary:
"The prompt is the template with only the two placeholders filled. It includes no summary of
our discussion and no code findings." It quoted the template instead: "*Fill in the domain and
the spec's path. Give it nothing else: no conversation, no summary of what the user said.*" The
rule is held by the brief as well as by step 9, so removing either one alone does not fail this
scenario.

### 8. A real dispatch (expect: the builder, not the author, raises the id-space gap)

Run 2026-11-06 with `claude -p --tools "Agent,Read" --setting-sources "" --strict-mcp-config
--output-format stream-json --verbose` from a new empty directory holding only
`templates/builder-check.md` and scenario 5's spec at
`docs/specs/2026-11-06-members-csv-export.md`. Prompt: this change's skill text (with the note
"`${CLAUDE_PLUGIN_ROOT}` is the current directory"), scenario 4's user quotes and "Looks like
you're nearly done. Send it over so I can approve it today.", then "Carry out step 9 now with the
tools you have. Do not edit or commit files [...]". The `Agent` call and the subagent's report
below come from the stream.

Expected: one `Agent` call whose prompt is the brief with the domain and the spec's path and
nothing else; the id-space question comes back in the subagent's report.

Result: the author read the brief and the spec, then made one call, `subagent_type:
"general-purpose"`, prompt verbatim except the absolute spec path: "You are a capable full-stack
engineer (Next.js + Postgres). You've been handed\na spec and asked to plan how to build what it
describes. You can't talk to its author.\n\nRead <dir>/docs/specs/2026-11-06-members-csv-export.md
and the ADRs and CONTEXT.md entries it links (if they exist, relative to that repo root).
[...]" followed by the rest of the brief, with nothing about the user's statements. The
subagent's report, second question: "**2. Are nation and chapter ids in one id space, so `:orgId`
always points to exactly one org?** [...] If they're separate tables with ids that can collide,
the route is ambiguous. That would be an authorization bug". It also returned the phones question,
the multi-admin button question and the audit log. The author sorted them (phones and audit log
"**Your call.**", button "**Minor, my call.**", id space "**Should be answered by the code, but I
couldn't check it.**", since the directory had no code) and told the user: "The builder check (a
fresh agent that only read the spec) turned up two things only you can decide and one fact I
couldn't verify". The builder also caught that the spec claims `CONTEXT.md` entries that do not
exist: "it found a gap of mine: **`CONTEXT.md` doesn't exist**, even though the spec's Decisions
section says the five terms were added to it."

## Asking

Run 2026-11-06 with `claude -p --tools "" --setting-sources "" --strict-mcp-config` from a new
empty directory per run, the prompt on stdin: "You follow this skill:", the skill text, `---`,
then the scenario. Red: `skills/spec/SKILL.md` at origin/main (`a0f7a79`). Green: this change's
text. Two runs of each, read in full; scenario B got two more red runs.

The issue's replacement text for steps 3-4 put the skill at 872 words (`wc -w`), over the 800
budget, so it was cut inside steps 3-4 only, to 798: "Never reopen a decision the user already
made" is carried by "isn't settled by the request, code or earlier answers", and "Later questions
may offer choices, each with its trade-off and your pick" was dropped. The green runs below are
against the cut text.

### 9. No purpose given, the code answers the rest (expect: an open "why" first, no options)

> You are working in a baton repo for a membership app (Next.js + Postgres). The user's whole
> message: "Can you add a CSV export of the members list?"
>
> In step 1 you read the code. What you found:
> - `app/members/page.tsx:12` calls `requireRole("admin")`: only admins can open the Members page.
> - `src/db/schema.ts:41` defines the `members` table with `name`, `email`, `phone`, `joined_on`
>   and a `status` column (`active`, `alumni`, `suspended`).
> - No existing spec in `docs/specs` covers exports.
>
> Step 2: this is one subsystem, no split needed.
>
> You have no tools in this session. Answer in text: write the exact message you send the user
> next, then in two or three sentences say why, quoting the skill text that drives it.

Expected: the first question is open, about why they want it, with no options; nothing the code
answers is asked.

Red (both runs): a menu that guesses the purpose. Run 1: "First question: **what will the
exported CSV mainly be used for?** 1. **Contact/mailing** [...] 2. **Records/reporting** [...]
3. **Migration/backup** [...] 4. Something else (please describe)." Rationale: "Step 3 says to
\"ask clarifying questions one at a time\" and to \"prefer multiple choice,\" with purpose listed
first. So I ask one multiple-choice question about purpose". Run 2 the same shape: "**A)**
Contacting members [...] **B)** Reporting or analysis [...] **C)** A full backup [...] **D)**
Something else."

Green (both runs): "Before I get into details: what do you need the CSV export for?" and "First:
what do you need the CSV export for?", no options, nothing about roles. Rationale: "The request
doesn't say why, and the skill says \"If they haven't said why, ask that first: open, no
options.\"" Run 2 also: "\"Process steps (write-up, file paths, more reading) are yours: do them,
say so\" are why I only report what I found and say I'll write the spec, instead of asking the
user about either."

### 10. A decision already made (expect: not reopened)

> You are working in a baton repo for a membership app (Next.js + Postgres). The conversation so far:
>
> User: "Can you add a CSV export of the members list?"
> You: "What do you need the export for?"
> User: "The national board calls every member before the convention, and they work from a
> spreadsheet. Only active members, no filters."
>
> In step 1 you read the code:
> - `app/members/page.tsx:12` calls `requireRole("admin")`: only admins can open the Members page.
> - `src/db/schema.ts:41` defines the `members` table with `name`, `email`, `phone`, `joined_on`,
>   `chapter_id` and a `status` column (`active`, `alumni`, `suspended`).
>
> Step 2: one subsystem, no split needed. You are now at step 3.
>
> You have no tools in this session. Answer in text: write the exact message you send the user
> next, then in two or three sentences say why, quoting the skill text that drives it.

Expected: alumni and filters are not asked again; the next question changes the build.

Not red (four runs at origin/main): documents behavior. Every run asked who may download, a
question that changes the build, and none reopened the status filter: "The purpose is settled
(the board phones members before the convention), and so is the scope (\"only active members, no
filters\")." The shape was the old step 3's menu: "**A)** Admins only, same as the Members page.
[...] **B)** National board members as well, through a new role or permission. [...] **C)**
Something else."

Green (both runs): the same question, not reopened. Run 1: "Got it: a CSV of every active member,
across all chapters, for the national board's call list. / Who should be able to download it?",
with "**A. Admins only (my pick).**" and a B. Rationale: "The skill's rule is to ask \"only what
changes the build and isn't settled by the request, code or earlier answers, one per message.\""
Run 2 asked it without options: "Are the board members who make the calls already admins, or
does the export need its own permission for them?"

### 11. The code leaves one sensible approach (expect: say so, no padded list)

> You are working in a baton repo for a membership app (Next.js + Postgres). You are writing a
> spec for a CSV export of the members list. Step 3 is done; the user told you:
> - "The national board calls every member before the convention; they work from a spreadsheet."
> - "Only active members, no filters. Columns: name, email, phone, chapter. Only admins."
>
> In step 1 you read the code:
> - `src/exports/csv.ts:8` exports `exportCsv(res, rows, columns)`: streams rows as UTF-8 with
>   BOM, RFC 4180 quoting and formula-injection escaping. It is used by
>   `app/api/events/export.csv/route.ts:5` and `app/api/payments/export.csv/route.ts:5`, each a
>   GET route that calls `requireRole("admin")`, runs one query and passes the rows to
>   `exportCsv`. Each has an integration test in `tests/exports/`.
> - `app/members/page.tsx:12` calls `requireRole("admin")`.
> - The largest nation has about 4,000 active members; the events export already streams 20,000 rows.
>
> You are now at step 4. You have no tools in this session. Answer in text: write the exact
> message you send the user for step 4, then in two or three sentences say why, quoting the skill
> text that drives it.

Expected: says there is one sensible way, why the others don't fit, and moves on.

Red (both runs): three options, two of them straw men. Run 1: "Three ways to build the members
CSV export. I recommend **A**." with "**B. Generate the CSV in the browser from the members
page.**" and "**C. Background job that emails or stores the file.** [...] I'd treat it as out of
scope (YAGNI)." Rationale: "Step 4 says \"Propose 2-3 approaches with trade-offs. Lead with your
recommendation and why.\" So the message gives three options". Run 2: "Here are the approaches I
considered. I recommend A." with the same B and C.

Green (both runs): "Only one approach makes sense here: follow the existing export pattern." and
"Only one approach makes sense here.", with the browser and background-job ideas given one line
each as "Alternatives I ruled out:" / "I considered two alternatives:", then "If you agree, I'll
present the design section by section". Rationale: "So I state the single approach and give each
alternative a concrete reason to drop it".

### 12. Process steps (expect: done and stated, not asked)

> You are working in a baton repo for a membership app (Next.js + Postgres) whose
> `.baton/config.json` sets `docs.specs` to `docs/specs`. The user's whole message: "Let's think
> through a CSV export of the members list so the national board can phone members before the
> convention. Not sure how formal you want to be about this."
>
> So far in step 1 you read `app/members/page.tsx` (line 12 calls `requireRole("admin")`) and
> `src/db/schema.ts:41` (the `members` table, with a `status` column: `active`, `alumni`,
> `suspended`). You have not yet opened `src/exports/`, a directory whose name you saw in the file
> tree. No spec in `docs/specs` covers exports.
>
> You have no tools in this session. Answer in text: say what you do next, then write the exact
> message you send the user next. In two or three sentences say why, quoting the skill text that
> drives it.

Expected: does not ask whether to write the spec, where to put it or whether to read more code.

Not red (both runs at origin/main): documents behavior. Both read `src/exports/` first ("finish
step 1 by reading `src/exports/` before asking anything") and answered the formality question
themselves: "On formality: light, but not skipped. This gets a short spec, maybe a page, that you
approve before any code." Their one question was a menu about who may download.

Green (both runs): the same, no process question. Run 1: "I'm reading `src/exports/` now to see
whether there's an existing export pattern to reuse." Rationale: "The skill makes extra reading my
job: \"Process steps (write-up, file paths, more reading) are yours: do them, say so.\"" Run 2
skipped the why question because "The user already gave the reason (phoning members before the
convention)".
