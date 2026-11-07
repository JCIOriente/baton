# Scenarios: review

Scenarios 1, 2, 7 and 8 test `skills/review/SKILL.md`, scenarios 3 and 4 test
`reviewers/spec-compliance.md`, scenario 5 tests `templates/implementer-brief.md`, scenario 6
tests `templates/re-review.md`. Each runs as a fresh session that gets only that one file and the
scenario text; scenario 2 also gets `templates/re-review.md`, inside `<template>` tags. The
baseline (RED) gets the file as it was before #12, or, where a scenario says so, as it was before
the review fixes of #12; the GREEN run gets the file after them.

Command, from a new empty directory each:
`claude -p --tools "" --setting-sources "" --strict-mcp-config "<prompt>"`, so the agent has no
tools, no memory and no project context. For scenarios 1, 2, 7 and 8 the prompt is the file inside
`<skill>` tags, the scenario text up to its Expected line inside `<scenario>` tags, and: "Answer as
that agent: what you would do next, which commands you would run and which subagents you would
dispatch, in order, and what you would tell the user, quoting your reasoning. You can't run
anything; the recorded outputs in the scenario stand in for the commands they name." For scenarios
3, 4, 5 and 6 the prompt is the file inside `<brief>` tags, the scenario inside `<scenario>` tags,
and: "You are the reviewer subagent. The brief above is your prompt, with its placeholders filled by
the scenario. You can't run anything; the scenario gives you the diff and the files. Output your
report exactly as the brief asks."

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
