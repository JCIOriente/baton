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

Since #114, steps 7 and 9 point into `templates/spec.md` (the self-review checklist comment) and
`templates/builder-check.md` (the no-subagent fallback and the question sorting), so the re-runs of
scenarios 4-8 after #114 also carry `templates/spec.md`: in `<template>` tags next to
`templates/builder-check.md` for 4-7, and as a file in the directory for 8.

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
message that the check ran in your own context, not a fresh one". Since #114 that sentence lives
in `templates/builder-check.md` ("No subagent tool: read the spec as that builder yourself, and
tell the user in the review message that the check ran in your own context, not a fresh one."),
which the prompt already carries; step 9 points there.

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

### 6b. No subagent tool, template not in the prompt (expect: step 9 leads to the template's fallback)

Added after review of #114: scenarios 4 and 6 paste `templates/builder-check.md` into the prompt,
so they never showed whether step 9 alone makes the author open the template, whose preamble now
holds the no-subagent fallback. Run 2026-11-07, three times, with `claude -p --tools "Read"
--setting-sources "" --strict-mcp-config --output-format stream-json --verbose` (Read only, so the
author has to find the template itself and has no subagent tool), each from a new directory
holding only `templates/builder-check.md`, `templates/spec.md` and scenario 5's spec at
`docs/specs/2026-11-06-members-csv-export.md`. Prompt on stdin: "You follow this skill:",
`skills/spec/SKILL.md` (the #114 text), `---`, then: "`${CLAUDE_PLUGIN_ROOT}` is the current
directory.", scenario 4's setup and user quotes with "Steps 1-8 are done", the spec's path, "Looks
like you're nearly done. Send it over so I can approve it today.", and "Carry out step 9 now with
the tools you have, up to and including the message where you ask the user to review. Do not edit
or commit files; say what you would write into the spec instead. End with the exact message you
send the user."

Expected: the author reads `templates/builder-check.md`, reads the spec as the builder, and the
review message says the check ran in its own context, not a fresh one.

Not red; documents behavior. 3 of 3 read the spec, then `templates/builder-check.md` (then looked
for `CONTEXT.md`), and the message says how the check ran. Run 1: "I ran the builder check in my
own context, not with a fresh reviewer, so it may have missed gaps that my knowledge of our
conversation filled in." Run 2: "Per the template, the review message says so." and "**How I
checked it:** I read the spec as a builder with no other context. I couldn't start a fresh agent
here, so the check ran in my own context and may have missed gaps that my context fills in for
me." Run 3: "The \"builder check\" (reading the spec as someone who wasn't in our conversation)
ran in my own context, not a fresh one." Step 9 was left as it is: naming the template is enough
for the author to open it.

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
budget, so it was cut inside steps 3-4 only, to 800. Every phrase of the issue's text that did
not ship as written, and what carries it now:

- "Never reopen a decision the user already made": shortened to "Never reopen their decisions."
  A first cut dropped it and relied on "isn't settled by the request, code or earlier answers";
  scenario 14 shows that was not enough.
- "neither the request, the code nor an earlier answer settles it": "the request or code doesn't
  settle"; earlier answers are covered by "Never reopen their decisions."
- "in their words" (the purpose question): dropped; "open, no options" remains.
- "Later questions may offer choices, each with its trade-off and your pick": dropped. Later
  questions may still offer choices; the skill no longer asks for a trade-off and a pick on each.
- "You need each of these before presenting a design; a gap is the next question": shortened to
  "Each gap below is the next question:" (scenario 13). Step 4 coming after step 3 carries
  "before presenting a design".
- "grounded in what the code does today" (step 4): dropped. Step 1 still reads the code and the
  existing-patterns bullet of step 3 still asks for the patterns to follow; nothing in step 4 says
  it again.
- "Lead with your recommendation and why": shortened to "your pick first and why".
- "When there is one sensible way, say so and why the others don't fit, instead of listing
  alternatives you would reject": shortened to "Only one sensible? Say so and why others don't
  fit." The "instead of listing alternatives you would reject" clause is dropped; scenario 11 shows
  the short form stops the padded list on its own.
- Reworded, same meaning: "what changes what gets built" -> "what changes the build", "one
  question per message" -> "one per message", "If they haven't said why they want it, that is the
  first question" -> "Unless they said why, ask that first", and "Process steps (what to write up,
  where files go, whether to look further) are your calls: do them and say so" -> "Process steps
  (write-up, file paths, more reading) are yours: do them, say so."

Scenarios 9-12 were first run (2026-11-06) against an earlier 798-word cut whose step 3 read "Ask
only what changes the build and isn't settled by the request, code or earlier answers, one per
message. If they haven't said why, ask that first: open, no options. [...] Before designing, you
need:". Review found it lost "a gap is the next question" (scenario 13) and "Never reopen"
(scenario 14). On 2026-11-07 each of 9-12 was re-run once against the shipped text; the result is
under each scenario as "Green (shipped text)".

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

Green (shipped text, one run): "Before I design anything: what will the exported CSV be used
for?", no options, after reporting what it read. Rationale: "Step 3 says \"Unless they said why,
ask that first: open, no options,\" and the user gave no reason."

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

Green (shipped text, one run): "Who should be able to download it: only admins, like the page
itself, or national board members who aren't admins?" Rationale: "You already said what the
export is for (board calls before the convention) and settled the scope (active members only, no
filters), so I don't reopen either. \"Never reopen their decisions.\""

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

Green (shipped text, one run): "Only one approach makes sense here: follow the two existing
exports.", then "Why the alternatives don't fit:" with the browser and background-job ideas.
Rationale: "Step 4 says \"Propose 2-3 approaches… Only one sensible? Say so and why others don't
fit.\" [...] I name it as the only fit and explain why each alternative fails, rather than
presenting them as real options."

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

Green (shipped text, one run): "I'm reading `src/exports/` now to see whether there's an export
pattern to reuse." and the one question about who downloads. Rationale: "Reading the directory is
mine to do because \"Process steps (write-up, file paths, more reading) are yours: do them, say
so.\""

### 13. A checklist gap is left when the user asks for approaches (expect: the gap is asked first)

Run 2026-11-07, same command. Red: the 798-word cut that ended step 3 with "Before designing, you
need:" (no "a gap is the next question"). Green: the shipped text.

> You are working in a baton repo for a membership app (Next.js + Postgres) used by JCI nations
> in several countries. The conversation so far:
>
> User: "Can you add a CSV export of the members list?"
> You: "What do you need the export for?"
> User: "The national board calls every member before the convention, and they work from a
> spreadsheet. Only active members, no filters. Columns: name, email, phone, chapter, joined_on."
> You: "Who should be able to download it: admins only, like the Members page?"
> User: "Yes, admins only. Great, what approach do you suggest?"
>
> In step 1 you read the code:
> - `app/members/page.tsx:12` calls `requireRole("admin")`.
> - `src/db/schema.ts:41` defines the `members` table: `name`, `email`, `phone`,
>   `joined_on timestamptz`, `chapter_id`, `status` (`active`, `alumni`, `suspended`).
> - `src/i18n/` has `es`, `en` and `pt` message files; `src/lib/format.ts:3` formats dates with
>   the viewer's locale and time zone from their profile.
> - `src/exports/csv.ts:8` exports `exportCsv(res, rows, columns)`, used by two other admin-only
>   export routes with integration tests; it writes ISO dates and English headers.
>
> You have no tools in this session. Answer in text: write the exact message you send the user
> next, then in two or three sentences say why, quoting the skill text that drives it.

Expected: no approaches yet; the next message asks one open audience question (tenancy, or header
language and `joined_on` time zone), not an assumption.

Not red (two runs, plus one run of an earlier wording of the scenario that also said "Nobody has
said anything about which language the headers should be in"): documents behavior. The checklist
alone held the agent at step 3. Run 1: "When an admin from one nation's board downloads \"all
active members\", should the file contain only their own nation's members, or every active member
in the system?" Rationale: "The user asked for approaches, but the skill says \"before designing,
you need… audience: which locales, time zones, currencies, tenants (organizations) it must
serve\"". Run 2 asked the same and: "I don't present approaches yet, even though the user asked
for them, because step 4 comes after step 3."

Green, against the text before the "Never reopen" fix ("Before designing, any gap is the next
question:"), both runs: the same tenancy question. Rationale: "the skill says \"Before designing,
any gap is the next question\" [...] So I ask it now instead of proposing approaches, even though
the user asked for them." Green (shipped text, one run): "For the boards' spreadsheets, should the
headers and `joined_on` follow the downloading admin's language and time zone, or match the other
two exports (English headers, ISO dates)?" Rationale: "The user asked for approaches, but step 3
comes before step 4. [...] I don't re-ask the purpose, columns or admin-only access, because the
skill says \"Never reopen their decisions.\""

### 14. A decision already made, with code that tempts a reopen (expect: not reopened)

Run 2026-11-07, same command. Red: origin/main, and the text before the "Never reopen" fix (step
3 opening "Ask only what changes the build and isn't settled by the request, code or earlier
answers", as in the 798-word cut, with "Before designing, any gap is the next question:").
Control: that text with "or earlier answers" also removed. Green: the shipped text. Two runs of
each.

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
>   `chapter_id` and a `status` column (`active`, `alumni`, `suspended`). A comment on line 40:
>   "suspended = membership lapsed for unpaid dues; reinstated on payment".
> - `app/api/alumni/export.csv/route.ts:5` already exports alumni for the alumni committee, which
>   uses it to invite alumni to the convention.
> - `docs/convention.md:14`: "Suspended members may attend the convention once their dues are paid."
>
> Step 2: one subsystem, no split needed. You are now at step 3.
>
> You have no tools in this session. Answer in text: write the exact message you send the user
> next, then in two or three sentences say why, quoting the skill text that drives it.

Expected: "only active members" is not reopened; the next question is another one that changes
the build (who downloads, which columns).

Red at origin/main (both runs): a menu reopening the status filter. Run 1: "One question about
\"only active members\" before I go on. [...] Which members should the board's spreadsheet
include? - **A.** Only `status = active`. [...] - **B.** `active` and `suspended`, with a status
column [...] - **C.** Something else." Run 2: "**A. `active` only**, as you said. [...] **B.
`active` and `suspended`**". Rationale: "The user said \"only active members,\" but the code and
docs give that two readings."

Red before the "Never reopen" fix (both runs): an open question, still reopening it. Run 1: "Should
suspended members be in the export? By \"active\" you might mean `status = 'active'` only." Run 2:
"You said only active members. Should suspended members be in the export too?" Rationale: "\"Only
active members\" is settled by the request, but the code and docs show it may not match the goal".
So "earlier answers" in the settle clause does not hold this; the agent reads the code as making
the answer unsettled.

Control, without "or earlier answers" (both runs): not reopened, both asked who downloads:
"I didn't ask again whether suspended members should be included, even though
`docs/convention.md:14` lets them attend once they pay. The user explicitly said \"only active
members,\" and asking again would re-argue a decision they already made." The clause is not the
lever either way; an explicit rule is.

Green (both runs): not reopened. Run 1 asked who downloads: "the skill says \"Never reopen their
decisions\". So I'm not asking again about including suspended members, even though
`docs/convention.md:14` raises the question." Run 2 asked which columns: "So I don't reopen that,
even though `docs/convention.md:14` mentions suspended members: \"Never reopen their decisions.\""

## Re-runs after #114

#114 cut `skills/spec/SKILL.md` from 800 to 576 words (`wc -w`) with no intended change in
behavior: step 5's section list now points at `templates/spec.md`, step 7's checklist moved into
a trailing comment in that template, the Design principles section was folded into steps 5 and 7,
and step 9's no-subagent fallback and question sorting moved into `templates/builder-check.md`.
Every scenario was re-run once (2026-11-07) against the new text with `claude -p --tools ""
--setting-sources "" --strict-mcp-config` from a new empty directory, the prompt on stdin: "You
follow this skill:", the new SKILL.md, `---`, the scenario text (the quoted prompt for 7 and
9-14). Scenarios 1-2 ended with "List the files you would create in step 8 (ADRs, `CONTEXT.md`)
and why", scenario 3 with a request for the exact commands for steps 6-10 and the directory each
runs in. For 4-7 the new `templates/builder-check.md` and `templates/spec.md` (with the checklist
comment) were added in `<template>` tags after the skill. Scenario 6 used scenario 4's prompt.
Scenario 8 ran as before (`--tools "Agent,Read"`, stream-json) in a directory holding both new
templates and scenario 5's spec. None regressed.

- 1. Re-run (#114): no ADR. "You said **no other planned spec depends on how status is
  stored**, so this choice fails that test." and "Being hard to reverse is not enough: if only
  this spec depends on the choice, its reasoning goes in the spec's FAQ, not an ADR."
- 2. Re-run (#114): an ADR, `docs/adr/0001-tenant-isolation-via-postgres-rls.md`. "Every later
  spec (events, certificates, reports) stores nation-scoped data, so each of them must follow the
  decision".
- 3. Re-run (#114): `baton worktree add members-csv-export`, written and committed there, then
  `git push -u origin "$(git branch --show-current)"` and `gh pr create` after approval. "The
  skill says it applies however small the spec is: \"the main checkout is never edited or
  committed in.\"" Step 7 now reads: "I check it against the checklist comment at the end of the
  template, fix issues inline, then delete the checklist comment."
- 4. Re-run (#114): self-review, then the builder check before review; the questions sorted into
  "**Your call**" and "My call" rows, the message with "**My calls.** I picked these; you haven't
  agreed to them, so please check them:". With no subagent tool: "per the template I \"read the
  spec as that builder yourself, and tell the user in the review message that the check ran in
  your own context, not a fresh one.\"" The message: "**Builder check:** I had no subagent, so it
  ran in my own context, not a fresh one. A fresh reader might find more."
- 5. Re-run (#114): sorted by the template's list, which it quoted ("Answered by the conversation
  or the code: write the answer into the spec."). Question 1 answered from `src/db/schema.ts:41`
  and written in; question 2 marked "(Author's call: one button for the organization in view, no
  picker. [...])"; phones and audit logging asked in one message, which lists "**My calls**,
  marked in the spec as author's calls. Change any of them if you disagree:" apart from them.
- 6. Re-run (#114): quoted the fallback from the template ("No subagent tool: read the spec as
  that builder yourself, and tell the user in the review message that the check ran in your own
  context, not a fresh one.") and the message says: "The builder check ran in my own context, not
  a fresh subagent, because no subagent tool was available. It has the blind spots that come with
  that."
- 7. Re-run (#114): the `Agent` prompt is the brief with "full-stack engineer (Next.js + Postgres)"
  and the spec's path, and "The prompt contains nothing about our conversation or the code
  findings." To the user: "Anything we already decided goes straight into the spec as a fix, and
  you won't see it as a question."
- 8. Re-run (#114): the author read `templates/builder-check.md` and the spec, then made one
  `Agent` call whose prompt is the brief with "full-stack web engineer" and the spec's absolute
  path, plus the line "Do not edit any files." and nothing from the conversation. The subagent's
  second question: "**Do nations and chapters share one id space?** [...] If they are separate
  tables whose ids can collide, the endpoint can't tell which one is meant". The author sorted it
  as "Answered by the code, but I can't confirm it from here", phones and audit log as "Your
  call", the button as "My call", and told the user: "A fresh reviewer read the spec cold".
- 9. Re-run (#114): "First question: what do you need the CSV export for?", no options.
  Rationale: "the skill's rule applies: \"Unless they said why, ask that first: open, no
  options.\""
- 10. Re-run (#114): not reopened; asked which columns. "The reason and the row set are already
  settled [...] and the skill says \"Never reopen their decisions.\""
- 11. Re-run (#114): "Only one approach makes sense here, so I'm proposing it directly rather than
  inventing alternatives." with "**Why not the alternatives:**" for the browser and background-job
  ideas.
- 12. Re-run (#114): no process question. "Right now I'm checking `src/exports/` for an existing
  export pattern to reuse." Rationale: "\"process steps (write-up, file paths, more reading) are
  yours: do them, say so.\""
- 13. Re-run (#114): no approaches yet; one tenancy question: "Should an admin's export contain
  **only their own nation's** active members, or every active member across all nations?"
  Rationale: "it comes before step 4's \"Propose 2-3 approaches.\""
- 14. Re-run (#114): not reopened; asked who downloads. "\"Never reopen their decisions\" means I
  don't second-guess excluding suspended members, even though `docs/convention.md:14` lets them
  attend."

## Asking before writing (#139)

#134: given "spec the migration of the design-system bundle to TSX components; settle the build
tool, type strategy and migration order as recommendations for the owner to approve", an agent
read the code, picked a bundler, a type strategy and a migration order, and wrote the spec, an ADR
and a glossary row in a worktree before the user saw any option. This change ports superpowers'
brainstorming order (lines 26-32 at 22f0b46), its how rule (lines 121-129), its play-back rule
(lines 198-199), the hard gate's "installing dependencies, creating projects" (line 273) and three
of its red flags (lines 290-293). It also adds `## Approaches` to `templates/spec.md` and the eval
`evals/spec-recommendations`.

Run 2026-11-14 with `claude -p --tools "" --setting-sources "" --strict-mcp-config` from a new
empty directory per run, the prompt on stdin: "You follow this skill:", the skill text, `---`,
the scenario, ending with: "You have no tools in this session. Answer in text. First list, in
order, every action you take from now until you next stop and wait for the user (tool calls,
commands, files you create or edit, subagents you dispatch). Then write the exact message you send
the user at that stop. Then, in two or three sentences, say why, quoting the skill text that drives
it." Red: `skills/spec/SKILL.md` at origin/main (`33500b9`). Green: this change's text. Two runs of
each, read in full.

Word budget: the skill grows from 576 to 1,110 words (`wc -w`). The additions are the order (with
its "just decide" exception), the how rule and the red flags, which are gates and their counters;
none moves out of SKILL.md. Recorded exception, cap 1,125.

### 15. Recommendation request gets options before any file (expect: a decision brief; no worktree, file or subagent)

> You are working in a baton repo for a design system (`.baton/config.json` sets `docs.specs` to
> `docs/specs`). The user's whole message:
>
> "Spec the migration of the design-system bundle to TSX components; settle the build tool, type
> strategy and migration order as recommendations for the owner to approve. Why: the bundle is
> hand-written JS nobody can type-check, and the apps that embed it break on every release."
>
> In step 1 you read the code:
> - `bundle/ds.js` is 2,900 lines of hand-written JS that defines 41 components as functions
>   returning DOM nodes, wrapped in an IIFE that sets `window.DS`.
> - `bundle/ds.d.ts` is a hand-kept type file; three of its signatures no longer match `ds.js`.
> - `package.json` has no build step and no dependencies; the bundle is copied as-is to the CDN
>   by `scripts/publish.sh`.
> - Two apps embed it with a `<script>` tag and call `window.DS.Button(...)`; no app imports it
>   as a module.
> - No spec in `docs/specs` covers the bundle.
>
> Step 2: one subsystem, no split needed. The request says why, and nothing in step 3's list is
> open that the request or code doesn't settle.

Not red in this harness (both runs): documents behavior. Both took no action and sent options with
a lean. Run 1: "Here are three ways to do the migration, with my pick first. [...] Which approach
should the spec go with?" Rationale: "The worktree and spec file only come at step 6, after the
approach is chosen and each section is approved". The text harness did not reproduce #134, so
the same request also ran with real tools (below).

With tools, red (2026-11-14, two runs): `claude -p --tools "Read,Glob,Grep,Write,Edit,Bash,Agent"`
with all of them allowed, `--max-turns 15`, `--output-format stream-json`, in a scaffolded git repo
holding `.baton/config.json`, a 26-line `bundle/ds.js` with four components, an out-of-date
`bundle/ds.d.ts`, `scripts/publish.sh` and a README naming the two apps, and `baton` on PATH as a
stub that logs its calls. Prompt: the skill (with `${CLAUDE_PLUGIN_ROOT}` pointing at copies of the
templates), `---`, and the request above. Not red either: both runs only read (three `Bash` reads
of the repo), then asked one question the repo leaves open, whether "TSX components" means React
or only the authoring syntax. Run 1: "One question before I go further, because it decides most of
the design: What does "TSX components" mean for the two apps?" No `Write`, `Edit`, `baton` call or
subagent.

Green (text harness, both runs): no action, then a brief. Run 1: "Before I write anything, here
are the three calls you asked to approve." with "**1. Build tool** (new to the repo: `package.json`
has no build step and no dependencies today)", each with "(my lean)", ending "Which way do you
want to go on each: 1A or 1B, 2A or 2B, 3A or 3B? I'll write the spec once you've picked."
Rationale: "The request says "recommendations for the owner to approve", and the build tool is new
to the repo. The skill puts both under "gets 2-3 options with your lean, and you wait", and its red
flag adds: "'Recommend' asks for options with your lean. Send them and wait for the pick.""
Green with tools (two runs): the same reads, then the same React-or-syntax question; no write.

Eval: `evals/spec-recommendations` scaffolds the same kind of bundle, with a README that settles
the React question ("no React or other runtime ships in the bundle"), so the expected answer is
the brief. Run 2026-11-14 with `claude plugin eval . --scaffold --trust-plugin --ablation none
--case spec-recommendations --allow-tools Write Edit Bash`, four runs in all: every `tool_used`
grader passed in each (`baton:spec` fired; `Write`, `Edit` and `worktree add` 0 times). The `llm`
grader passed 2 of 2 with the README line ("judge votes: PASS PASS PASS"). The two runs before the
line was added failed it ("FAIL FAIL PASS", "FAIL FAIL FAIL"); the one whose trace was kept asked
the React question. A passing run ends: "Which way do you want to go on 3, 4 and 5, and on happy-dom vs a stub? Once you pick,
I'll write the spec in its own worktree".

`Write`, `Edit` and `Bash` are gated tools: a run may use one only when the case lists it in
`allowed_tools` and the command line grants it with `--allow-tools`. `make evals` passes
`--allow-tools Write Edit Bash`, so the three 0-count graders run with the tools offered.

### 16. Outcome-only request needing a new library asks for that choice only (expect: internal design as author's calls, the library as options with a lean)

> You are working in a baton repo for a membership app (Next.js + Postgres, `docs.specs` is
> `docs/specs`). The conversation so far:
>
> User: "The national board wants the members export to open in Excel with each chapter on its
> own sheet, so they can hand one sheet to each chapter president before the convention. Same
> columns and same people as the CSV export, admins only."
>
> In step 1 you read the code:
> - `app/api/members/export.csv/route.ts:5` is a GET route that calls `requireRole("admin")`,
>   runs one query for active members and passes the rows to `exportCsv(res, rows, columns)` from
>   `src/exports/csv.ts:8`.
> - `package.json` dependencies: `next`, `react`, `pg`, `zod`. Nothing in `package.json` or
>   `package-lock.json` reads or writes .xlsx files.
> - The largest nation has 4,000 active members in 60 chapters.
>
> Step 2: one subsystem. The user said why and who; nothing in step 3's list is left open.

Not red (both runs at origin/main): documents behavior. Both offered `exceljs` (lean), SheetJS and
a hand-written writer, and asked which. Run 1: "Which approach should we use? Once you choose,
I'll walk through the design section by section". The reuse of the route's role check and query
was stated as fact, not as the author's call.

Green (three runs): the same question, now framed as the user's call, with the reuse stated
around it. Run 1: "Writing a real .xlsx with one sheet per chapter needs something the repo doesn't
have yet. [...] Adding a new dependency or format is your call." Rationale: "the skill says such a
choice "never hands over a technology, dependency or architecture new to the repo: it is the
**user's call** even when the request only describes outcomes"". Run 2: "The rest stays as it is.
The new route reuses the CSV route's `requireRole("admin")` check and its active-members query".

### 17. Outcome-only request reusing a lockfile dependency asks nothing about it (expect: no question about the library)

Scenario 16 with these lines in place of the `package.json` line:

> - `package.json` dependencies: `next`, `react`, `pg`, `zod`, `exceljs` (locked at 4.4.0 in
>   `package-lock.json`).
> - `src/exports/xlsx.ts:6` exports `exportXlsx(res, sheets)`, which builds a workbook with
>   `exceljs`, one sheet per entry of `sheets`, and streams it.
>   `app/api/payments/export.xlsx/route.ts:5` uses it, with an integration test in `tests/exports/`.

Not red (both runs at origin/main): no library question. Run 1: "Only one approach makes sense
here, so I'm not offering alternatives." Both then presented the first design section in the same
message.

Green (both runs): no library question. Run 2: "`exceljs` 4.4.0 is in `package.json` and the
lockfile [...] So none of the options adds a dependency." Rationale: "`exceljs` is already in the
lockfile, so I don't ask about it as a dependency question ("something in its manifest or lockfile
needs no question")." Both then laid out the route shape (a sibling route vs a format switch) as
the approaches message and waited, with no design section in it.

### 18. User says just decide (expect: each choice in one line, as author's calls, before writing)

Scenario 16 with the user's message ending: "I don't want to be asked about any of this: just
decide, your call on everything, and write it up.", and "Step 2: one subsystem." as the last line.

Red (both runs at origin/main): wrote first and listed the calls afterwards. Run 1: "**Bash:**
`baton worktree add members-xlsx-export`", then "**Write** `docs/specs/2026-11-14-members-xlsx-export.md`",
a builder check and a commit; the calls reach the user only in the review message: "The spec is
written and committed in the worktree [...] You told me to decide everything, so I did. These are
**my calls, not things you've agreed to**".

Green, first wording ("When they say "just decide" or "your call", decide, and state each choice in
one line before you write."), two runs: overcorrected. Both asked about the library anyway: "One
choice I can't make for you: the repo has nothing that writes .xlsx [...] That decision is yours."
Rationale: "the skill says that "never hands over a technology, dependency or architecture new to
the repo"". The rule for new technology won over the user's "just decide".

Second wording ("that hands you their calls too: decide, state each choice in one line in place
of the approaches message, then write."), two runs: no question, but run 2 put the one-liners only
in the review message after writing: "I decide each choice and state it in one line in the message
at the stop."

Shipped wording ("that hands you their calls too: decide, send each choice in one line as the
approaches message, then write without waiting."), two runs: the one-liners are sent first, then
the worktree and spec. Run 1, action 1: "**Send the approaches message as a message of its own.**
It lists every call in one line each, marked as mine. I don't wait for a reply", with "**New
dependency: `exceljs`** to write the .xlsx file. It is new to the repo"; action 2 is `baton
worktree add`. The spec's Approaches section "lists the choices above as **author's calls** under
"user delegated all calls". It does not say the user picked them."

### Re-runs after #139

Scenarios 3 and 9-14 re-run once each (2026-11-14) against the shipped text, same harness as
their sections. None regressed; 11 changed as intended.

- 3. `baton worktree add members-csv-export` from the main checkout, everything else "in the path
  it prints", the spec written "with the sections you approved and your pick under
  **Approaches**".
- 9. "Before anything else: what do you need the CSV for?", no options.
- 10. Not reopened; asked who may download.
- 11. One approach, the alternatives dropped with reasons, and now a wait: "Shall I go with the
  GET route reusing `exportCsv`? Once you confirm, I'll write the spec." Rationale: "When only one
  approach is sensible, it says "say so and why others don't fit, and still wait for their
  answer.""
- 12. Read `src/exports/` itself; "Process steps (write-up, file paths, more reading) are yours:
  do them, say so." quoted; one question about who downloads.
- 13. The locale and time-zone gap asked before any approach: "Once you answer, I'll send the
  approaches with my recommendation."
- 14. Not reopened; asked which columns. "\"Never reopen their decisions\" and they said \"only
  active\"."
- 18 (after the Order section's "just decide" exception, 2026-11-14, one run): the one-line calls
  sent first as action 1 ("This is not a stop. [...] the one-line calls are the approaches
  message and I continue without waiting"), `exceljs` among them marked new to the repo, then
  `baton worktree add` and the spec; the review message lists each call as "None of them were
  agreed with you".
