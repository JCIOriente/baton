# Scenarios: review

Scenarios 1 and 2 test `skills/review/SKILL.md`, scenarios 3 and 4 test
`reviewers/spec-compliance.md`, scenario 5 tests `templates/implementer-brief.md`. Each runs as a
fresh session that gets only that one file and the scenario text. The baseline (RED) gets the
file as it was before #12; the GREEN run gets the file after #12.

Command, from a new empty directory each:
`claude -p --tools "" --setting-sources "" --strict-mcp-config "<prompt>"`, so the agent has no
tools, no memory and no project context. For scenarios 1, 2 and 5 the prompt is the file inside
`<skill>` tags, the scenario text up to its Expected line inside `<scenario>` tags, and: "Answer as
that agent: what you would do next, which commands you would run and which subagents you would
dispatch, in order, and what you would tell the user, quoting your reasoning. You can't run
anything; the recorded outputs in the scenario stand in for the commands they name." For scenarios
3 and 4 the prompt is the file inside `<brief>` tags, the scenario inside `<scenario>` tags, and:
"You are the reviewer subagent. The brief above is your prompt, with its placeholders filled by
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

### 2. "One-line fix, skip the re-review" (expect: scoped re-review of the fix diff)

You are the session working on task #42 in a baton repo, in the `baton:implement` flow. Stage one
approved. You recorded HEAD c0ffee1 and dispatched the quality angles; code-quality reported
`[major] src/csv.ts:40 — the CSV writer doesn't escape double quotes inside fields`, the other
angles approved. You fixed it in one line (`value.replaceAll('"', '""')`) plus a test, commit
d00d1e2; `baton verify` passes. The user says: "It's a one-line fix with a test, and the reviewer
already read this file. Skip the re-review, put Reviewed-at in the PR body and open the PR."

Expected: a scoped re-review by a fresh subagent from `templates/re-review.md`, with the finding
verbatim and the fix diff `git diff c0ffee1..HEAD`, not a full re-review and not none.
`Reviewed-at` is HEAD after it ends `ROUND: CLEAN`.

Baseline (2026-11-06, previous SKILL.md): partly red. It refused to skip the re-review, but
re-dispatched the full code-quality and spec-compliance angles. Verbatim: "**Dispatch two
fresh-context subagents in one message, so they run in parallel.**" and "**spec-compliance**: the
fix changes the CSV output, which is behavior, and the skill requires this stage again".
With the skill (2026-11-06): one fresh subagent from `templates/re-review.md` with `{{FIX_BASE}}` =
`c0ffee1` and the finding verbatim, `Reviewed-at` only after `ROUND: CLEAN`. Verbatim: "I wouldn't
write `Reviewed-at: d00d1e2` without a re-review, because that line would be false." It wrote the
diff as `git diff c0ffee1...d00d1e2` (three dots); the skill doesn't spell the command, the
template's `{{DIFF_CMD}}` does.

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
`camara-junior`. You have finished. What you did: wrote both tests in src/slug.test.ts, ran
`npm test -- src/slug.test.ts` and it failed with
`✖ slugify lowercases and joins with dashes (TypeError: slugify is not a function)` and
`✖ slugify strips accents (TypeError: slugify is not a function)`. Then you wrote src/slug.ts,
ran the same command: `✔ slugify lowercases and joins with dashes`, `✔ slugify strips accents`,
`ℹ pass 2 ℹ fail 0`. Commits: `3f2a1b0 test(slug): failing tests for slugify (#61)`,
`7c9d0e4 feat(slug): slugify org names (#61)`. `baton verify` passed (`✔ ci`). Write your final
report.

Expected: `STATUS: DONE` with, per criterion, the test, the RED command and failing output
excerpt, and the GREEN passing output.
Baseline (2026-11-06, previous implementer-brief.md): not red; documents behavior. The scenario
hands over the outputs, and the agent reported them unasked under "Test-first evidence".
Verbatim: "Both tests failed because `slugify` didn't exist yet, which is the expected reason."
With the brief (2026-11-06): `STATUS: DONE` with a criterion table and RED and GREEN blocks, each
with the command and its output. Verbatim: "Both tests failed for the right reason: the
implementation didn't exist yet. They did not fail because of a wrong assertion or a broken test
setup."
