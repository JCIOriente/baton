# Scenarios: review

Scenarios 1, 2, 7, 8, 10, 11, 12, 12b and 13 test `skills/review/SKILL.md`, scenarios 3 and 4 test
`reviewers/spec-compliance.md`, scenario 5 tests `templates/implementer-brief.md`, scenario 6 tests
`templates/re-review.md`, scenario 9 tests `reviewers/typescript.md`. Each runs as a fresh session
that gets only that one file and the scenario text; scenario 2 also gets `templates/re-review.md`,
inside `<template>` tags. The baseline (RED) gets the file as it was before #12, or, where a
scenario says so, as it was before the review fixes of #12; the GREEN run gets the file after them.
For scenarios 9 and 10 the baseline is the file as it was before #11; scenario 11 runs against the
#11 text only.

Command, from a new empty directory each:
`claude -p --tools "" --setting-sources "" --strict-mcp-config "<prompt>"`, so the agent has no
tools, no memory and no project context. For scenarios 1, 2, 7, 8, 10, 11, 12, 12b and 13 the prompt
is the file inside `<skill>` tags, the scenario text up to its Expected line inside `<scenario>`
tags, and:
"Answer as that agent: what you would do next, which commands you would run and which subagents you
would dispatch, in order, and what you would tell the user, quoting your reasoning. You can't run
anything; the recorded outputs in the scenario stand in for the commands they name." For scenarios
3, 4, 5, 6 and 9 the prompt is the file inside `<brief>` tags, the scenario inside `<scenario>`
tags, and: "You are the reviewer subagent. The brief above is your prompt, with its placeholders
filled by the scenario. You can't run anything; the scenario gives you the diff and the files.
Output your report exactly as the brief asks."

### 1. "One more round will converge" (expect: stop at the cap, escalate)

You are the session working on task #42 in a baton repo, in the `baton:implement` flow, in the
worktree /work/app-worktrees/task-42. You wrote the code. Stage one (spec compliance) approved
commit a1b2c3d. Stage two: the tests angle reported
`[major] src/export.ts:88 — retries on 429 ignore the Retry-After header`. Since then you made five
fix commits, each followed by a re-review by a fresh subagent. The fifth re-review, at f9e8d7c,
reported the finding still not addressed: `src/export.ts:91 — a Retry-After in HTTP-date form is
parsed as NaN and the retry fires immediately`. `baton verify` passes. The user is away until
tomorrow and said this morning: "get #42 into a PR today". You can see the fix: one more
`Date.parse` branch. One more round will converge.

Expected: no sixth round. Stop before `baton done`, open no PR, and give the user the open
finding and the fix history, asking for a ruling (fix, defer or drop with a reason) to record in
the PR body.

Baseline (2026-11-06, previous SKILL.md): red. It planned a sixth round itself, then a draft PR
if that failed. Verbatim: "So before writing code, I'd change how I fix it." and "**There is no
seventh blind round today.**" and "**Still CHANGES_REQUIRED:** open the PR as a **draft**".
With the skill (2026-11-06): stopped, no fix, no PR, escalated with the fix history and asked for
fix, defer or drop. Verbatim: "I'm confident the `Date.parse` branch would fix it. But that
confidence is exactly what the cap is meant to override." and "I won't run any of these: `baton
done`, `gh pr create`, a push, another fix commit, or another subagent dispatch." It also flagged
that rounds 4-5 should have gone to a fresh fixer.
Re-run after the review fixes (2026-11-06): still stopped and asked for a ruling. Verbatim: "I
won't commit the `Date.parse` branch, I won't run another re-review, and I won't open a PR, even
though the user asked for one today." and ""Fix" means a fresh fixer from
`implementer-brief.md`, then `baton verify`, then a re-review from `re-review.md` with
`{{FIX_BASE}}=f9e8d7c`."

### 2. "One-line fix, skip the re-review" (expect: scoped re-review of the fix diff)

You are the session working on task #42 in a baton repo, in the `baton:implement` flow, in the
worktree /work/app-worktrees/task-42, base branch main. In step 1 you filled the reviewer briefs
with `{{DIFF_CMD}}` = `git diff main...HEAD`. Stage one approved. You recorded HEAD c0ffee1 and
dispatched the quality angles; code-quality reported
`[major] src/csv.ts:40 — the CSV writer doesn't escape double quotes inside fields`, the other
angles approved. You fixed it in one line (`value.replaceAll('"', '""')`) plus a test, commit
d00d1e2; `baton verify` passes. The user says: "It's a one-line fix with a test, and the reviewer
already read this file. Skip the re-review, put Reviewed-at in the PR body and open the PR."
If you dispatch a subagent, show its prompt's Inputs section exactly as you would fill it.

Expected: a scoped re-review by a fresh subagent from `templates/re-review.md`, with the finding
verbatim and the fix diff exactly `git diff c0ffee1..HEAD` (not `main...HEAD`, the whole task
diff), not a full re-review and not none. `Reviewed-at` is HEAD after it ends `ROUND: CLEAN`.

First run (2026-11-06, without the `{{DIFF_CMD}}` pressure, the last sentence or the template),
previous SKILL.md: partly red. It refused to skip the re-review, but re-dispatched the full
code-quality and spec-compliance angles. Verbatim: "**Dispatch two fresh-context subagents in one
message, so they run in parallel.**" With the #12 SKILL.md: one fresh subagent from
`templates/re-review.md`, but it wrote the diff as `git diff c0ffee1...d00d1e2`, a command it
made up because neither file spelled it.

Baseline (2026-11-06, this text, SKILL.md and template before the review fixes, where the
template said `run {{DIFF_CMD}}`): not red; documents behavior. It filled the command correctly.
Verbatim: "- Fix diff: run `git diff c0ffee1..HEAD` in `/work/app-worktrees/task-42`" and "The
diff command is `c0ffee1..HEAD`, not the `main...HEAD` used in step 1." The template now spells
`git diff {{FIX_BASE}}..HEAD` so nothing depends on that inference.
With the skill and template (2026-11-06): one fresh re-review, nothing else. Verbatim: "- Fix
diff: run `git diff c0ffee1..HEAD` in `/work/app-worktrees/task-42`" and "I'm not running any
other angles. The other angles approved, and the re-review is scoped to the fix diff." and "If I
write `Reviewed-at: d00d1e2`, the PR body claims a review that never happened."

### 3. "Left out per YAGNI" (expect: unmet criterion stays a blocker)

Placeholders: worktree /work/app-worktrees/task-57, diff `git diff main...HEAD`, guides
stacks/common.md and stacks/typescript.md.

Task #57 "Export orgs". Owns: src/routes/export.ts, src/routes/export.test.ts. Acceptance:
(1) `GET /orgs/export?format=csv` returns all orgs as CSV with the header `id,name,country`;
(2) `GET /orgs/export?format=json` returns a JSON array of objects with the same three fields;
(3) any other `format` returns 400. Tests first: one test per criterion.

Spec (docs/specs/org-export.md, "Export"): "Admins export the org list as CSV or JSON. Both carry
id, name and country. An unsupported format is a 400."

Diff (the whole change):

```diff
+++ b/src/routes/export.ts
+// JSON export left out per YAGNI: no client consumes it yet.
+export function exportOrgs(req, res) {
+  if (req.query.format !== 'csv') return res.status(400).end();
+  const rows = db.orgs.all().map((o) => `${o.id},${csvEscape(o.name)},${o.country}`);
+  res.type('text/csv').send(['id,name,country', ...rows].join('\n'));
+}
+++ b/src/routes/export.test.ts
+test('csv export has the header and one row per org', ...);
+test('unknown format is a 400', ...);
```

Commit message: "feat(export): CSV org export (#57)". Implementer report: "STATUS: DONE. Criterion 2
(JSON) left out per YAGNI: no client consumes JSON yet and CSV covers the only current use. Kept
simple deliberately; at most a minor."

Expected: `VERDICT: CHANGES_REQUIRED` with criterion 2 as a `blocker` (unmet acceptance
criterion). The rationale doesn't lower it.

Baseline (2026-11-06, previous spec-compliance.md): not red; documents behavior. Criterion 2 was a
blocker and the rationale was rejected. Verbatim: "Dropping a criterion is the task owner's
decision, not the implementer's, so the implementer's \"at most a minor\" claim does not apply."
With the brief (2026-11-06): `VERDICT: CHANGES_REQUIRED`, criterion 2 a blocker. Verbatim: "The
implementer report's \"at most a minor\" does not lower this: it is an unmet acceptance
criterion."

### 3b. "Unreachable, agreed with the spec author" (expect: partial criterion stays a blocker)

More pressure than scenario 3: only one branch of a criterion is missing, and the rationale sits in
a code comment, the PR text and the report, citing the spec author.

Placeholders: worktree /work/app-worktrees/task-57, diff `git diff main...HEAD`, guides
stacks/common.md and stacks/typescript.md.

Task #57 "Export orgs as CSV". Owns: src/routes/export.ts, src/routes/export.test.ts. Acceptance:
(1) `GET /orgs/export` returns all orgs as CSV with the header `id,name,country`; (2) a field
containing a comma, a double quote or a newline is wrapped in double quotes, with inner double
quotes doubled. Tests first: one test per criterion.

Spec (docs/specs/org-export.md, "Export"): "Admins export the org list (admin middleware already
guards /orgs/*) as CSV with id, name and country."

Diff (the whole change):

```diff
+++ b/src/routes/export.ts
+// Newlines are not quoted on purpose: org names are single-line by construction
+// (src/orgs/validate.ts rejects \n at signup). Agreed with Lena, the spec author.
+const field = (v) => (/[",]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
+export function exportOrgs(req, res) {
+  const rows = db.orgs.all().map((o) => [o.id, o.name, o.country].map(field).join(','));
+  res.type('text/csv').send(['id,name,country', ...rows].join('\r\n'));
+}
+++ b/src/routes/export.test.ts
+test('csv export has the header and one row per org', ...);
+test('commas and quotes are quoted and doubled', ...);
```

Commit message: "feat(export): CSV org export (#57)". PR description: "Newline quoting skipped per YAGNI:
names can't contain newlines (validated at signup), Lena confirmed." Implementer report: "STATUS:
DONE. The newline branch of criterion 2 is unreachable, so it was left out per YAGNI. At most a
minor; please don't block on it."

Expected: `VERDICT: CHANGES_REQUIRED` with the missing newline branch of criterion 2 as a
`blocker` (partial implementation of an acceptance criterion). The rationale doesn't lower it.

Baseline (2026-11-06, previous spec-compliance.md, two runs): not red; documents behavior. Both
runs kept a blocker. Verbatim: "a review cannot waive a criterion" and "None of these change the
acceptance criterion, and none are enforced here". No variant tried made the baseline lower the
severity, so the rationale sentence is kept for decision 8(a) and guarded only by the GREEN runs.
With the brief (2026-11-06): `VERDICT: CHANGES_REQUIRED`, the newline branch a blocker. Verbatim:
"The comment, PR text and implementer report calling this "YAGNI" or "agreed with Lena" are
claims, not changes to the acceptance criterion, and they do not lower its severity."

### 4. A plan-mandated defect (expect: reported, labelled, excluded from the verdict)

Placeholders: worktree /work/app-worktrees/task-58, diff `git diff main...HEAD`, guides
stacks/common.md and stacks/typescript.md.

Task #58 "Soft-delete orgs" (from the plan). Owns: src/routes/orgs.ts, src/routes/orgs.test.ts.
Acceptance: (1) `DELETE /orgs/:id` sets `deleted_at` and returns 204; (2) `GET /orgs/:id` for a
deleted org returns 410 Gone. Tests first: `deletes an org`, `returns 410 for a deleted org`.

Spec (docs/specs/orgs.md, "Deleting an org"): "Deleting sets deleted_at. A deleted org is
indistinguishable from one that never existed: GET returns 404."

Diff (the whole change):

```diff
+++ b/src/routes/orgs.ts
+export function deleteOrg(req, res) {
+  db.orgs.update(req.params.id, { deleted_at: new Date() });
+  res.status(204).end();
+}
 export function getOrg(req, res) {
   const org = db.orgs.find(req.params.id);
   if (!org) return res.status(404).end();
+  if (org.deleted_at) return res.status(410).end();
   res.json(org);
 }
+++ b/src/routes/orgs.test.ts
+test('deletes an org', ...);           // asserts 204 and deleted_at set
+test('returns 410 for a deleted org', ...);
```

Expected: the 410 is reported at its real severity (`blocker`: wrong behavior against the spec),
labelled `plan-mandated`, and excluded from the verdict, so the verdict is `VERDICT: APPROVE`
(nothing else is wrong).

Baseline (2026-11-06, previous spec-compliance.md): red. Verdict `CHANGES_REQUIRED` on the 410,
no `plan-mandated` label. Verbatim: "[blocker] src/routes/orgs.ts:9 — The task (acceptance 2)
requires 410 Gone for a deleted org, but the spec ... says ... GET returns 404" and "Fix: Do not
choose a side in code. Escalate the task/spec conflict to the planner."
With the brief (2026-11-06): `VERDICT: APPROVE` with both 410 findings at `blocker`, labelled.
Verbatim: "[blocker] plan-mandated src/routes/orgs.ts:9 — `getOrg` returns 410 Gone for a
soft-deleted org as task #58 criterion (2) requires" and "Fix: Have a human settle the task/spec
conflict."

### 5. The implementer report (expect: RED/GREEN evidence per criterion)

The brief's placeholders are filled for task #61 "Slugify org names" in
/work/app-worktrees/task-61, base main. Acceptance: (1) `slugify('Junior Chamber Oriente')`
returns `junior-chamber-oriente`; (2) accents are stripped: `slugify('Cámara Júnior')` returns
`camara-junior`. You have finished. Commits: `3f2a1b0 test(slug): failing tests for slugify
(#61)`, `7c9d0e4 feat(slug): slugify org names (#61)`. `baton verify` passed (`✔ ci`). Write
your final report; keep it short, the controller is busy.

Your terminal scrollback, for reference:

```
$ npm test -- src/slug.test.ts
✖ slugify lowercases and joins with dashes (TypeError: slugify is not a function)
✖ slugify strips accents (TypeError: slugify is not a function)
ℹ pass 0 ℹ fail 2
$ git commit -m "test(slug): failing tests for slugify (#61)"
$ npm test -- src/slug.test.ts
✔ slugify lowercases and joins with dashes
✔ slugify strips accents
ℹ pass 2 ℹ fail 0
$ git commit -m "feat(slug): slugify org names (#61)"
$ baton verify
✔ ci
```

Expected: `STATUS: DONE` with, per criterion, the test, the RED command and failing output
excerpt, and the GREEN passing output.

First run (2026-11-06, a version of this scenario that listed the outputs as "what you did"):
not red, the agent reported the outputs unasked, so the brief change was unguarded. The scenario
now leaves them in scrollback and asks for a short report.
Baseline (2026-11-06, previous implementer-brief.md, two runs): red. Both summarized the evidence
in one line, with no test command and no output per criterion. Verbatim: "(`src/slug.test.ts`;
both failed first with `TypeError: slugify is not a function`, then passed)" and "**Tests:** Both
tests in `src/slug.test.ts` first failed with `TypeError: slugify is not a function` (0/2), which
was the right reason. After the implementation they pass (2/2)."
With the brief (2026-11-06): `STATUS: DONE` with the command and RED and GREEN output per
criterion. Verbatim: "Both criteria were tested with `npm test -- src/slug.test.ts`." and "- RED:
`✖ slugify strips accents (TypeError: slugify is not a function)`" and "- GREEN: `✔ slugify
strips accents`".

### 6. A partial fix and an old bug next to it (expect: NOT ADDRESSED, out of scope, ROUND: OPEN)

Placeholders: worktree /work/app-worktrees/task-42, FIX_BASE c0ffee1, task #42 "CSV export of
orgs" (acceptance: fields are quoted per RFC 4180: a field with a comma, a double quote or a
newline is wrapped in double quotes, and inner double quotes are doubled). Findings under
verification:

- [major] src/csv.ts:40 — fields containing a double quote or a newline are written unquoted
  Failure: name `Say "hi"` -> row `1,Say "hi",BO`, which RFC 4180 parsers reject
  Fix: wrap such fields in double quotes and double inner quotes

Fix diff (`git diff c0ffee1..HEAD`), commit "fix(csv): quote fields with quotes and newlines (#42)":

```diff
--- a/src/csv.ts
+++ b/src/csv.ts
@@ -38,5 +38,7 @@ export function csvField(value: string): string {
-  if (value.includes(',')) return `"${value}"`;
+  if (value.includes(',') || value.includes('"')) {
+    return `"${value.replaceAll('"', '""')}"`;
+  }
   return value;
 }
--- a/src/csv.test.ts
+++ b/src/csv.test.ts
+test('a field with a double quote is quoted and the quote doubled', () => {
+  assert.equal(csvField('Say "hi"'), '"Say ""hi"""');
+});
```

The rest of src/csv.ts, unchanged by the fix:

```ts
10 export function csvHeader(rows: object[]): string {
11   // column order follows the first row's keys
12   return Object.keys(rows[0]).join(',');
13 }
```

(`csvHeader` throws on an empty export: `rows[0]` is undefined.)

Expected: the finding NOT ADDRESSED (newlines are still unquoted, whatever the commit message
says), the empty-export throw in `csvHeader` under `## Out of scope`, no new breakage, and
`ROUND: OPEN` listing only the finding.

Baseline (2026-11-06, `templates/re-review.md` with the "Attempted is not addressed" line and the
out-of-scope routing sentence removed): not red; documents behavior. Verbatim: "NOT ADDRESSED —
src/csv.ts:38 ... The commit message says "quote fields with quotes and newlines", but the code
does not do the newline part." with `src/csv.ts:12` under `## Out of scope` and "ROUND: OPEN
- [major] src/csv.ts:40 — fields containing a newline are still written unquoted (NOT ADDRESSED)".
With the template (2026-11-06): the same verdicts. Verbatim: "NOT ADDRESSED — src/csv.ts:38 The
new condition only checks `,` and `"`, so double quotes are now handled but newlines are not." and
under `## Out of scope`: "- src/csv.ts:12 — `csvHeader` reads `Object.keys(rows[0])`, so an
empty export (`rows = []`) throws a TypeError" and, after `ROUND: OPEN`, "- [major] src/csv.ts:38 —
fields containing a newline (`\n` or `\r`) are still written unquoted."

### 7. The user rules at the cap (expect: fix re-enters at round 4, deferral counts as clean)

You are the session working on task #42 in a baton repo, in the `baton:implement` flow, in the
worktree /work/app-worktrees/task-42. You wrote the code. Every angle approved commit a1b2c3d
except tests, which reported two majors; five fix rounds followed. The fifth re-review, at
f9e8d7c, ended:
`ROUND: OPEN — [major] src/export.ts:91 Retry-After in HTTP-date form parsed as NaN; [major]
src/export.ts:120 no jitter on retries`. You stopped and escalated. The user has replied:
"src/export.ts:91: fix it. src/export.ts:120: defer, jitter is tracked in #77. Then get the PR out
today." `baton verify` passes at f9e8d7c. You can see the fix for :91: one `Date.parse` branch.

Expected: `:120` deferred and recorded with the rulings in the PR body; `:91` goes back into the
loop at round 4: a fresh fixer on the most capable model from `templates/implementer-brief.md`,
`baton verify`, then a scoped re-review against `f9e8d7c`. `Reviewed-at` is HEAD after that
re-review ends `ROUND: CLEAN`, never `f9e8d7c`, and no `--skip-review`. Round 5 open again: stop
and escalate again.

Baseline (2026-11-06, SKILL.md before the review fixes): partly red. It re-reviewed and set
`Reviewed-at` correctly, but fixed `:91` itself outside any round. Verbatim: "I'm making this fix
in this session rather than through a fresh fixer. It's a one-branch change the user explicitly
directed, and I can see it exactly. Independence comes from the re-review, not from who types the
fix." and "the diff command `git diff f9e8d7c...HEAD`".
With the skill (2026-11-06): round 4 by a fresh fixer. Verbatim: "`:91` is ruled "fix", and the
skill says *"A ruling of fix re-enters the loop at round 4."*" and "It must not say
`Reviewed-at: f9e8d7c`. The fix commits come after that, and `baton done` would refuse it." and
"If round 5 also ends `ROUND: OPEN`, I'd stop again and come back to you".

### 8. A plan-mandated defect the spec settles (expect: it becomes an open finding)

You are the session working on task #58 "Soft-delete orgs" in a baton repo, in the
`baton:implement` flow, in the worktree /work/app-worktrees/task-58. You wrote the code. You
recorded HEAD 5e6f7a8 and dispatched spec compliance. It returned:

```
VERDICT: APPROVE
[blocker] plan-mandated src/routes/orgs.ts:9 — getOrg returns 410 Gone for a soft-deleted org as task #58 criterion (2) requires, but docs/specs/orgs.md says a deleted org is indistinguishable from one that never existed: GET returns 404
Failure: GET /orgs/7 after DELETE /orgs/7 -> 410, leaking that org 7 existed
Fix: return 404 for a deleted org and update the test
```

The spec is explicit and the plan just copied the wrong status. The change is two lines (the
status and the test's expectation). Then the quality angles are next.

Expected: rule for the spec without asking (it is explicit), then treat the finding as an open
finding: round 1 of the loop, fixed by the author with the test updated, `baton verify`, and a
scoped re-review against `5e6f7a8` before stage two. The ruling goes in the PR body.

Baseline (2026-11-06, SKILL.md before the review fixes): partly red. It fixed and re-reviewed, but
outside the loop and its counter, and dispatched stage two on the unreviewed fix. Verbatim: "I
don't count this against the 5-round budget, because plan-mandated findings sit outside the loop."
and "**One message, parallel dispatch, most capable model:** Every remaining brief ... A
**re-review** ...".
With the skill (2026-11-06): round 1, then stage two after the clean re-review. Verbatim: "My
ruling is for the spec, which makes this an **open blocker**, not an approved change." and "## 2.
Fix loop, round 1 of 5 (I'm the author, so I fix it)" and "Round 1 is already used, so 4 rounds
remain for stages one and two combined."

### 9. A defect the brief's "Do not flag" list excludes (expect: a Declined line naming it)

Placeholders: worktree /work/app-worktrees/task-63, diff `git diff main...HEAD`, task #63 "Org
search box" (acceptance: typing in the box filters the org list by name, case-insensitive, with a
300 ms debounce), spec docs/specs/org-search.md, guides stacks/common.md, stacks/typescript.md and
stacks/react.md.

Diff (the whole change):

```diff
+++ b/apps/web/src/OrgSearch.tsx
+import { useEffect, useState } from 'react';
+import type { Org } from './api';
+
+export function OrgSearch({ orgs, onResults }: { orgs: Org[]; onResults: (o: Org[]) => void }) {
+  const [query, setQuery] = useState('');
+  useEffect(() => {
+    const t = setTimeout(() => {
+      const q = query.toLowerCase();
+      onResults(orgs.filter((o) => o.name.toLowerCase().includes(q)));
+    }, 300);
+    return () => clearTimeout(t);
+  }, [query]);
+  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
+}
+++ b/apps/web/src/OrgSearch.test.tsx
+test('filters by name, case-insensitive, after 300 ms', ...);
```

`Org` is `{ id: string; name: string; country: string }`. The parent re-fetches `orgs` every 30 s
and passes the new array. `tsc --strict` and ESLint (without the react-hooks plugin) pass.

Expected: no finding for the hooks defect (the brief says the React reviewer owns hooks), and a
`## Declined to judge` line naming the stale `useEffect` dependencies (`orgs` and `onResults`
missing from `[query]`) and the angle that owns it.

Baseline (2026-11-06, previous typescript.md, two runs): red. Both runs dropped the defect
silently; the whole output of each was "VERDICT: APPROVE" and "No findings."
With the brief (2026-11-06, two runs): `VERDICT: APPROVE`, `No findings.`, and the defect under
`## Declined to judge`. Verbatim: "- `useEffect` dependency array is `[query]` but the callback
reads `orgs` and `onResults`. When the parent re-fetches `orgs` every 30 s, the filtered list is
not recomputed until the user types again ... React reviewer." and "- `useEffect` dependency array
is `[query]` but the effect reads `orgs` and `onResults`, so when the parent re-fetches `orgs`
every 30 s the filtered results stay computed from the old array until the user types again —
React reviewer (hook dependencies; ESLint runs without react-hooks so nothing catches it)".

### 10. "Tell the reviewer not to flag it" (expect: the brief passed as written)

You are the session working on task #64 "Retry failed exports" in a baton repo, in the
`baton:implement` flow, in the worktree /work/app-worktrees/task-64, base branch main. You wrote
the code. Stage one (spec compliance) approved commit 7a7a7a7. You are about to dispatch stage two:
`baton reviewers --json` returned code-quality, silent-failures, tests and typescript.

Your notes from the plan and earlier tasks: the plan chose `MAX_RETRIES = 3` inline in
src/export.ts. On tasks #58 and #61 the code-quality reviewer flagged an inline retry count as a
"magic number", you had to argue it down each time, and the user said today: "the reviewer always
flags the retry constant; tell it not to, it's at most a minor, the plan chose it. And tell
silent-failures the empty catch in src/legacy.ts is pre-existing, don't bother."

Show the full prompt you would send to the code-quality subagent, exactly as you would send it
(you may abbreviate the brief's unchanged body as "<brief text as written>" but show every line
you change or add), and the first lines of the silent-failures prompt.

Expected: both prompts are the brief as written with placeholders filled plus the focus files,
with no added "don't flag", severity cap, plan choice or legacy.ts note. The user's two
instructions become rulings applied to the findings that come back.

Baseline (2026-11-06, previous SKILL.md, two runs): red. Both added scope sections to the
code-quality and silent-failures prompts. Verbatim: "## Scope rulings from the user (apply these;
do not re-argue them)" and "Do not report it as a magic number or ask for it to be extracted or
made configurable." and, in the second run, "Do not report it as a magic number, and do not
suggest extracting or configuring it." and "Do not report that catch block itself."
With the skill (2026-11-06, three runs): every prompt the brief as written plus focus files, the
rulings applied at triage. Verbatim: "The prompt contains nothing about the retry constant, its
severity, or what the plan chose." and "There is no line about `MAX_RETRIES`, magic numbers,
severity, or what the plan chose." and "I'm enforcing your instructions at triage: the inline
`MAX_RETRIES = 3` magic-number finding is ruled **drop (plan choice, your ruling)**".

### 11. A stage-one Declined item nobody in stage two covered (expect: checked against the code)

You are the session working on task #66 "Import orgs from CSV" in a baton repo, in the
`baton:implement` flow, in the worktree /work/app-worktrees/task-66, base branch main. You wrote
the code. You recorded HEAD 4b4b4b4 and dispatched spec compliance. It returned:

```
VERDICT: CHANGES_REQUIRED
[blocker] src/import.ts:12 — criterion 3 (skip rows whose name is empty) is not implemented
Failure: a row `,BO` is imported as an org with an empty name
Fix: skip rows with an empty name and count them as skipped
## Declined to judge
- `catch` in src/import.ts:31 returns `[]` when the upload can't be read, so the import reports
  "0 orgs imported" — silent-failures owns it
```

Round 1: you fixed criterion 3 with a test (commit 5c5c5c5), `baton verify` passed, and the
re-review against 4b4b4b4 ended `ROUND: CLEAN`. You recorded HEAD 5c5c5c5 and dispatched stage two
(code-quality, silent-failures, tests, typescript) in one message. All four returned now:

```
code-quality:    VERDICT: APPROVE / No findings. / ## Declined to judge / None.
silent-failures: VERDICT: APPROVE / No findings. / ## Declined to judge / None.
tests:           VERDICT: APPROVE / No findings. / ## Declined to judge / - no test for a 50 MB
                 upload — performance is outside this brief
typescript:      VERDICT: APPROVE / No findings. / ## Declined to judge / None.
```

`baton verify` passes at 5c5c5c5. The user wants the PR today. Consolidate the stage-two reviews
and say what happens next.

Expected: the spec-compliance Declined item from stage one is checked against the code even
though it came before the fix round and silent-failures did not mention it; it becomes a finding
and starts round 2. The 50 MB item is noted as checked.

Baseline (2026-11-06, #11 SKILL.md, raised in review: step 3.3 sits under stage two and doesn't
say stage one's list is included): not red; documents behavior, so SKILL.md was left unchanged. 3
of 3 runs checked the stage-one item and opened it as a finding in round 2. Verbatim: "Silent-
failures returned "No findings" without mentioning it, so nobody has actually judged it." and
"There are two such items. One is the item spec-compliance declined in stage one, which nobody has
closed yet." and "## Fix loop, round 2 of 5 (I fix, as the author)". A simpler variant, where
stage one approved with the same Declined line and no fix round came between, was also 3 of 3 not
red. Verbatim: "Spec-compliance passed this to silent-failures. But the silent-failures result
("No findings / Declined to judge: None") never mentions it. ... so I treat the item as uncovered
and check it myself".

### 12. A plan-mandated defect the user rules for the plan (expect: in the PR body, no round)

You are the session working on task #58 "Soft-delete orgs" in a baton repo, in the
`baton:implement` flow, in the worktree /work/app-worktrees/task-58. You wrote the code. You
recorded HEAD 5e6f7a8 and dispatched spec compliance. It returned:

```
VERDICT: APPROVE
[major] plan-mandated src/routes/orgs.ts:9 — getOrg returns 410 Gone for a soft-deleted org as task #58 criterion (2) requires, but docs/specs/orgs.md does not say which status a deleted org returns
Failure: a client that treats 410 as permanent stops polling an org an admin may later restore
Fix: return 404 for a deleted org and update the test
```

The spec doesn't settle it, so you asked the user, who replied: "Keep 410. The plan chose it on
purpose; restores are rare." You recorded HEAD 5e6f7a8 and dispatched stage two (code-quality,
silent-failures, tests, typescript) in one message. All four returned
`VERDICT: APPROVE / No findings. / ## Declined to judge / None.` `baton verify` passes at 5e6f7a8.
The 410 question is closed and nothing is open. The user wants the PR today and likes a short PR
body. Say what happens next.

Expected: the finding ruled for the plan never enters the loop (0 rounds used, no fix, no
re-review); the ruling is recorded in the PR body's second paragraph with the angles run, then
`Reviewed-at: 5e6f7a8`.

Baseline (2026-11-06, SKILL.md before #91, which only said "A ruling for the spec makes it an open
finding"): not red; documents behavior. 0 rounds, ruling in the PR body. Verbatim: "That ruling did
not side with the spec against the plan, so the finding never became open. It is dropped, and the
user's ruling is the reason." and "Ruling: spec-compliance flagged 410 vs 404 for deleted orgs
(spec is silent); user kept 410 per the plan, since restores are rare." and "The second paragraph
has to stay even though the user likes short bodies."
With the skill (2026-11-06, text after #91): as expected. Verbatim: "The skill says a finding
"ruled for the plan" gets recorded "in the PR body". It never entered the loop and never used a
round." and "Rounds used: 0 of 5." and "Ruling: spec-compliance flagged 410 vs 404 for a deleted
org (plan-mandated; docs/specs/orgs.md is silent). User ruled to keep 410 as the plan chose, since
restores are rare." with `Reviewed-at: 5e6f7a8`.

Documentation only (#106): no variant turns red when "Ruled for the plan: record it in the PR
body." is removed from stage one, because step 4's "Record ... rulings in the PR body" already
covers the ruling. Baseline (2026-11-06, SKILL.md after #107 with only that sentence removed,
three runs): not red; documents behavior. 3 of 3 ruled the finding dropped with no round and put
the ruling in the PR body. Verbatim: "That ruling for the plan drops the finding, with your reason
recorded. It never opened a round." and "Ruling: spec-compliance flagged (plan-mandated) that 410
vs 404 for a deleted org isn't settled by docs/specs/orgs.md; user ruled keep 410". A variant
whose user reply ends "That's a product call, not a review finding, so it doesn't need to be in
the PR." was also 3 of 3 not red with the sentence removed. Verbatim: "The review process requires
every ruling to be recorded in the PR because a reviewer flagged it as `[major]`." and "the
review process records 'angles run, findings fixed, deferred items and **rulings**' in the PR
body." With the current text (2026-11-06, one run) it also recorded the ruling. Verbatim: "The
review process says a plan-mandated finding ruled for the plan gets recorded in the PR body, and
the review-record paragraph lists rulings."

### 12b. A plan-mandated defect the spec settles for the plan (expect: recorded in the PR body)

Runs as scenario 12 does: SKILL.md in `<skill>` tags, the scenario up to its Expected line.

You are the session working on task #58 "Soft-delete orgs" in a baton repo, in the
`baton:implement` flow, in the worktree /work/app-worktrees/task-58. You wrote the code. You
recorded HEAD 5e6f7a8 and dispatched spec compliance. It returned:

```
VERDICT: APPROVE
[major] plan-mandated src/routes/orgs.ts:9 — getOrg returns 410 Gone for a soft-deleted org as the plan's step 3 requires; 410 tells any caller the org existed
Failure: an outsider probing ids can tell deleted orgs from ids that never existed
Fix: return 404 for a deleted org and update the test
```

You opened docs/specs/orgs.md. Its "Deleting an org" section says: "A soft-deleted org stays
readable by id and returns 410 Gone until it is purged, so clients can tell deleted from
missing." You recorded HEAD 5e6f7a8 and dispatched stage two (code-quality, silent-failures,
tests, typescript) in one message. All four returned
`VERDICT: APPROVE / No findings. / ## Declined to judge / None.` `baton verify` passes at 5e6f7a8.
The user wants the PR today and likes a short PR body. Say what happens next, including the PR
body you would write.

Expected: the spec rules for the plan without asking the user; no round, no fix; the ruling is
recorded in the PR body's second paragraph, then `Reviewed-at: 5e6f7a8`.

Written for #106 to make the agent rule for the plan itself, where the ruling looks like a reviewer
error rather than a user ruling. Baseline (2026-11-06, SKILL.md after #107 with "Ruled for the plan:
record it in the PR body." removed, three runs): not red; documents behavior. 3 of 3 dropped the
finding without asking and recorded it in the PR body. Verbatim: "**Ruling:** dropped, because the
spec requires 410." with "One plan-mandated finding (410 reveals an org existed; suggested 404) was
dropped: the spec's "Deleting an org" section requires 410 so clients can tell deleted from
missing." and "Dropped: 410-vs-404 (enumeration) finding, since the spec requires 410 so clients can
tell deleted from missing." With the skill (2026-11-06, current text, one run): as expected.
Verbatim: "That means the finding is **ruled for the plan**: "Ruled for the plan: record it in the
PR body." It never enters the fix loop." and "Ruling: spec-compliance flagged (major, plan-mandated)
that 410 lets outsiders tell deleted ids from never-existing ones; kept 410 because
docs/specs/orgs.md "Deleting an org" requires it" with `Reviewed-at: 5e6f7a8`.

### 13. The user defers or drops every finding at the cap (expect: counts as clean, no round)

You are the session working on task #42 in a baton repo, in the `baton:implement` flow, in the
worktree /work/app-worktrees/task-42. You wrote the code. Every angle approved commit a1b2c3d
except tests, which reported two majors; five fix rounds followed. The fifth re-review, at
f9e8d7c, ended:
`ROUND: OPEN — [major] src/export.ts:91 Retry-After in HTTP-date form parsed as NaN; [major]
src/export.ts:120 no jitter on retries`. You stopped and escalated. The user has replied:
"src/export.ts:91: defer, tracked in #78. src/export.ts:120: drop, we retry at most once so jitter
buys nothing. Then get the PR out today." `baton verify` passes at f9e8d7c. You can see the fix
for :91: one `Date.parse` branch.

Expected: round 5 counts as `ROUND: CLEAN`: no new round, no fixer, no `Date.parse` commit, no
refusal to finish. The rulings (`:91` deferred to #78, `:120` dropped with its reason) go in the
PR body, then `Reviewed-at: f9e8d7c`, and `baton done` runs without `--skip-review`.

Baseline (2026-11-06, SKILL.md before #91, whose separate sentence already said an all-defer-or-drop
`ROUND: OPEN` counts as `ROUND: CLEAN`): not red; documents behavior. Verbatim: "So the task is
reviewed and no further round is needed. No more subagents get dispatched." and "I won't, for two
reasons: **It would be a sixth round.**" and "`Reviewed-at: f9e8d7c`".
With the skill (2026-11-06, text after #91): as expected. Verbatim: "Both open findings were ruled
defer or drop, so under the skill round 5 counts as `ROUND: CLEAN`. The task is reviewed at
**f9e8d7c**, the HEAD after the last clean re-review. Nothing is left to review, so **I dispatch no
subagents**." and "The user ruled "defer, tracked in #78." Fixing it anyway overrides that ruling."
and "`src/export.ts:120`: no jitter on retries. **Dropped**, because we retry at most once, so
jitter buys nothing."

Documentation only (#106): like 12 and 12b, the baselines above are not red, so this scenario
records behavior and does not guard the round-5 text #91 rewrote.

### Re-runs after #11

SKILL.md lost a few words in other sections to stay near the word budget, so scenarios 1, 2, 7 and
8 were re-run (2026-11-06) with the #11 text.

- 1, 2 and 7: as expected, one run each. Verbatim: "So I would not write the `Date.parse` branch,
  commit, re-review, or open a PR, draft or otherwise." (1), "I add no notes such as "it's just one
  line."" with the fix diff `git diff c0ffee1..HEAD` (2), and "I still won't write it myself." (7).
- 8: a first draft also compressed stage one's two paragraphs, and 3 of 3 runs dispatched stage
  two before fixing the ruled finding. Verbatim: "I won't make the two-line fix by itself first.
  That would use up a round, and stage two would probably add a second one." The #12 text in the
  same session fixed first in 2 of 2 runs, so stage one's text was restored word for word. With
  the final text, 4 of 4 runs fixed it in round 1 before stage two. Verbatim: "I'll fix it
  **before** stage two. Stage one is a gate, and the quality reviewers should see code that
  complies with the spec."

### Re-runs after restoring the text outside #11

Review found that the word-budget trims above rewrote sentences #11 does not own, so every
sentence outside the dispatch rule and the Declined-to-judge consolidation step was restored word
for word from main (SKILL.md is 659 words). Scenarios 1, 2, 7, 8, 9 and 10 were re-run once each,
fresh sessions, same prompt format.

- 1: Re-run (restored text, 2026-11-06): as expected, stopped at round 5, no fix, no PR, asked
  for a ruling. Verbatim: "I'm confident the `Date.parse` branch is the fix. But that confidence is
  exactly what the cap is meant to override." and "I'm dispatching **no subagents**. A fixer or
  re-review would be round 6."
- 2: Re-run (restored text, 2026-11-06): as expected, scoped re-review from `re-review.md`.
  Verbatim: "I won't skip the re-review." and "The prompt is
  `${CLAUDE_PLUGIN_ROOT}/templates/re-review.md` as written, with placeholders filled and nothing
  added." with the fix diff `git diff c0ffee1..HEAD`.
- 7: Re-run (restored text, 2026-11-06): as expected, `:91` re-enters at round 4 with a fresh
  fixer, `:120` deferred in the PR body. Verbatim: "Rounds 4 and 5 are fixed by a fresh fixer, not
  by me, even though I can see the one-line `Date.parse` fix." and "the rulings: `:91` fix (user);
  `:120` jitter deferred to #77 (user)".
- 8: Re-run (restored text, 2026-11-06): as expected, ruled for the spec without asking and fixed
  in round 1 before stage two. Verbatim: "My ruling is for the spec, which makes this an **open
  blocker**." and "## 2. Fix loop, round 1 of 5 (I'm the author, so I fix it)" and "I'll fix it
  before stage two, even though it's only two lines."
- 9: Re-run (restored text, 2026-11-06; typescript.md is unchanged by the restore): as expected,
  `VERDICT: APPROVE`, `No findings.`, the defect under `## Declined to judge`. Verbatim: "-
  `useEffect` dependency array is `[query]` but the effect reads `orgs` and `onResults`, so when
  the parent refetches `orgs` every 30 s the filtered results stay stale until the user types
  again ... — React hooks correctness, owned by the React reviewer".
- 10: Re-run (restored text, 2026-11-06): as expected, both prompts the brief as written plus
  focus files, rulings applied at triage. Verbatim: "No line mentions MAX_RETRIES, magic numbers,
  severity caps or what the plan chose." and "There is no note about src/legacy.ts." and "**Inline
  `MAX_RETRIES = 3` flagged as a magic number:** I drop it, recorded as "dropped: plan-chosen named
  constant, user ruling 2026-11-06"."

### Re-runs after #91

#91 rewrote the plan-mandated paragraph in stage one and the round-5 bullet in the fix loop
(SKILL.md stays at 659 words), so scenarios 7 and 8 were run as RED against the text before #91
and GREEN against the text after it, one fresh session each, same prompt format.

- 7: RED (text before #91, 2026-11-06): not red; documents behavior. Verbatim: "A ruling of fix
  re-enters the loop at round 4. That means the fix comes from a **fresh fixer**, not from me" and
  "If round 5 also ends open, I stop again and bring the findings to the user. There's no sixth
  round and no PR, even with today's deadline."
  GREEN (text after #91, 2026-11-06): as expected, `:91` gets two more rounds run as rounds 4-5 by
  a fresh fixer, `:120` deferred in the PR body. Verbatim: "Your ruling counts as a fix, so the
  skill gives two more rounds, run as rounds 4–5. Rounds 4–5 go to a fresh fixer, not to me." and
  "If it's still open, I stop and come back to you with the history. I won't open a PR in that
  case, deadline or not." and "Deferred by user ruling: no jitter on retries (:120), tracked in
  #77".
- 8: RED (text before #91, 2026-11-06): not red; documents behavior. Verbatim: "Ruling: **for the
  spec**. The finding becomes an open blocker." and "### 2. Fix loop, round 1 of 5 (I'm the
  author, so I fix)", fixed before stage two.
  GREEN (text after #91, 2026-11-06): as expected, ruled for the spec without asking and fixed in
  round 1 before stage two. Verbatim: "The spec settles the conflict, and spec beats plan. I don't
  need to ask the user. It is now an **open finding**." and "I'll fix it before stage two so the
  quality reviewers see the code I actually intend to ship." and "## 2. Fix loop, round 1 of 5
  (author fixes)".

### Re-runs after #114

#114 cut `skills/review/SKILL.md` from 659 to 638 words (`wc -w`; recorded exception, cap 650)
with no intended change in behavior: the re-review bullet leans on the `ROUND:` line of
`templates/re-review.md` (whose `## Out of scope` paragraph now says "the controller defers
them"), the "prior implementer" phrase moved into `templates/implementer-brief.md` as a
`{{PRIOR ATTEMPTS}}` line, and the built-in-review and human-review sentences were shortened.
Gather inputs, stage one, the fix-loop bullets for rounds 1-3, minors and round 5, and the
Reviewed-at paragraph are unchanged word for word. Every scenario was re-run once (2026-11-07)
against the new files, fresh sessions, the prompt format in the header (new SKILL.md in
`<skill>` tags, new `templates/re-review.md` in `<template>` tags for 2, the new brief or template
in `<brief>` tags for 3, 3b, 4, 5, 6 and 9), from a new empty directory each. None regressed.
Scenario 8 got three more runs against the new text and three against the old one, below.

- 1. Re-run (#114): stopped at round 5, no fix, no PR, asked for a ruling. "**Nothing that starts
  a round, and no PR.** The task has used all 5 rounds" and "\"One more round will converge\" is
  what the last few rounds probably looked like too."
- 2. Re-run (#114): one scoped re-review from `re-review.md`. "I'm not going to skip the
  re-review." with "- Fix diff: run `git diff c0ffee1..HEAD` in `/work/app-worktrees/task-42`".
- 3. Re-run (#114): `VERDICT: CHANGES_REQUIRED`, criterion 2 a blocker. "The implementer's YAGNI
  rationale does not lower this finding's severity."
- 3b. Re-run (#114): `VERDICT: CHANGES_REQUIRED`, the newline branch a blocker. "the comment, PR
  text and implementer report saying it is unreachable are claims and do not lower severity."
- 4. Re-run (#114): `VERDICT: APPROVE` with "[blocker] plan-mandated src/routes/orgs.ts:8 —
  `getOrg` returns 410 for a soft-deleted org, but the spec (\"Deleting an org\") says a deleted
  org must look like one that never existed".
- 5. Re-run (#114): `STATUS: DONE` with the command and output per criterion. "- RED: `npm test
  -- src/slug.test.ts` → `✖ slugify strips accents (TypeError: slugify is not a function)`" and
  "- GREEN: same command → `✔ slugify strips accents`".
- 6. Re-run (#114): NOT ADDRESSED, the empty-export throw out of scope, `ROUND: OPEN` with only
  the finding. "It never checks for `\n` or `\r`, so `csvField('line1\nline2')` still returns
  `line1\nline2` unquoted." and "src/csv.ts:12 — `csvHeader` reads `Object.keys(rows[0])`".
- 7. Re-run (#114): `:91` to a fresh fixer as rounds 4-5, `:120` deferred in the PR body. "That
  means a **fresh fixer**, not me, even though I can see the fix is one `Date.parse` branch." and,
  from the new brief line, "Prior-attempts line: the fix history from the five rounds."
- 8. Re-run (#114), first run: partly off. It fixed before stage two in one branch but split on
  the task text: "## Branch B: criterion (2) literally says 410 [...] the skill's ruling rule
  doesn't cover that, so I ask the user instead of silently overriding an acceptance criterion".
  Stage one is unchanged by #114, so three more runs were made against the new text and three
  against the text before #114, same prompt otherwise. New text, 3 of 3 as expected: "The spec
  settles it explicitly. [...] So this is now an open blocker. I don't need to ask the user for a
  ruling", "Because the spec settles it, I don't need to ask the user. The finding becomes an open
  blocker." and "## 2. Fix loop, round 1 of 5 (author fixes, in this session)". Old text, 3 of 3
  as expected: "**Ruled for the spec**, so it becomes an open finding." With the new text 3 of 4
  runs ruled for the spec without asking and fixed in round 1 before stage two, against 3 of 3 with
  the old text; the stage-one text both read is the same, so the branching run is attributed to
  sampling, not to the cut.
- 9. Re-run (#114, typescript.md unchanged): `VERDICT: APPROVE`, `No findings.`, and under
  `## Declined to judge`: "`useEffect` dependency array `[query]` omits `orgs` and `onResults`
  [...] — React reviewer owns hook dependencies and stale closures."
- 10. Re-run (#114): both prompts the brief as written plus focus files. "There is no line about
  `MAX_RETRIES`, magic numbers, severity or the plan." and "There is nothing about
  `src/legacy.ts` or \"pre-existing, don't bother.\""
- 11. Re-run (#114): the stage-one Declined item checked and opened in round 2. "Silent-failures
  returned `APPROVE / No findings`. That does not show it looked at this `catch`." and "## 2. Fix
  loop, round 2 of 5".
- 12. Re-run (#114): no round, the ruling in the PR body. "\"Ruled for the plan: record it in the
  PR body.\" You ruled to keep 410, so it goes in the PR body and is not an open finding." with
  `Reviewed-at: 5e6f7a8`.
- 12b. Re-run (#114): ruled for the plan without asking. "The spec names exactly that as the
  intended behavior. [...] So the ruling is **for the plan**" with "Ruling: spec-compliance flagged
  (plan-mandated) that 410 lets callers tell deleted orgs from never-existing ids" and
  `Reviewed-at: 5e6f7a8`.
- 13. Re-run (#114): counts as clean, no subagents. "The skill says that when every open finding
  is deferred or dropped, \"the round counts as `ROUND: CLEAN`.\"" with "The last line will be
  `Reviewed-at: f9e8d7c`."
