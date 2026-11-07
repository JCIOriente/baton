# Scenarios: writing-skills

Run each scenario as a fresh session that gets only `.claude/skills/writing-skills/SKILL.md` and
the scenario text up to its Expected line. The agent answers as someone editing guidance in this
repo: the exact text it would write, where it would put it, and which form of guidance it is.

## Form by failure type

The baseline is the SKILL.md before the "Choose the form by failure type" subsection was added
(origin/main at 5c61fd4), not an empty prompt: the guide already existed and the question is what
the new subsection changes.
Some baseline runs were meant as "after" runs but went out before the edit had been saved; the
skill file they got was byte-identical to the old one (`cmp`), so they count as baseline runs.

Runs on 2026-11-06 used `claude -p --tools "" --setting-sources "" --strict-mcp-config "<prompt>"`
(Claude Code 2.1.316) from a new empty directory each, so the agent had no tools, no memory and no
project context. The prompt is the skill inside `<skill>` tags, the scenario inside `<scenario>`
tags, and: "Answer as that agent. Give the exact text you would write and the file it goes in,
name the form of guidance you chose, and quote your reasoning in one short paragraph."

### 1. Wrong output shape (expect: a positive recipe, not a prohibition)

You maintain the reviewer brief `reviewers/code-quality.md`. In the last ten reviews the reviewer
agents reported every real finding, but each report first restated the diff file by file, and the
verdict ("approve" or "changes requested") appeared in the last paragraph, where the integrating
agent missed it twice. Write the text you would add to the brief to fix this.

Expected: a positive recipe or contract for the report: its parts in order, verdict first. No
list of "don't restate the diff" / "never put the verdict last" prohibitions as the fix.
Baseline (2026-11-06, six runs): red in all six. Each wrote a report template with the verdict on
line one, and each put a prohibition next to it. Verbatim, run 1: "- Do not summarize or restate
the diff. The integrating agent already has it."; run 3: "- Do not restate or summarize the diff.
The integrating agent already has it."; run 4: "Do not summarize or restate the diff. The
integrating agent already has it. Mention a file only when it has a finding."; run 5 called it
"The ban on restating the diff names the habit directly and explains why".
After (three runs): green in all three. A numbered recipe ("Your report has exactly these parts,
in this order: 1. Verdict ... 2. Findings ...") with no "don't" line. Verbatim, run 3: "A recipe
that fixes the verdict as the first line and the findings as the only body leaves no room for a
file-by-file summary. ... So I added no 'don't' lines and no 'unless it matters' clauses."

### 2. Missing element (expect: a REQUIRED slot in the template)

Agents fill `templates/pr-body.md` (two headings: `## Summary` and `## Testing`) when they open a
PR. About half of the PRs they open have no `Refs #<issue>` line, so the issue doesn't link. The
skill that uses the template, `skills/integrate/SKILL.md`, already says "reference the issue".
Write the change.

Expected: the template gains a required slot for the issue reference (for example a `Refs #` line
marked REQUIRED). Not another reminder in the skill's prose.
Baseline (2026-11-06, two runs): not red; documents behavior. Both put `Refs #<issue>` at the top
of the template and left the skill alone. Verbatim: "Agents fill templates slot by slot, so a line
they are not given is a line they drop."
After (one run): the same, with the slot marked: "Refs #<issue-number>  <!-- REQUIRED. Replace
<issue-number> with the issue this PR implements. -->". Verbatim: "That is an omission, not a rule
they break under pressure, so the fix is a slot they have to fill in, not another reminder."

### 3. An exception to a rule (expect: a conditional on something observable, no nuance clause)

The stack guide `stacks/common.md` will say agents don't add a `CHANGELOG.md` entry, because
release-please writes it. Some projects that use baton have no release-please and keep a
hand-written `CHANGELOG.md`; there, a user-visible change needs an entry. Write the rule.

Expected: a conditional keyed to something an agent can check (for example whether
`release-please-config.json` exists), not "don't add an entry unless it matters" or "unless the
project needs one".
Baseline (2026-11-06, two runs): not red; documents behavior. Both branched on the
release-please files. Verbatim: "I named concrete detection files instead of saying 'if the
project uses release-please,' because agents guess when there's no visible test."
After (one run): three `If ...` branches on `release-please-config.json` and `CHANGELOG.md`.
Verbatim: "'Don't add a CHANGELOG entry unless the project keeps one by hand' is exactly the kind
of nuance clause that reopens negotiation, and 'by hand' is not something an agent can check."

### 4. Testing new wording (expect: a micro-test with a no-guidance control first)

You drafted a new sentence for `skills/integrate/SKILL.md` to stop agents from listing changed
files in PR bodies. Each full pressure scenario takes about twenty minutes to run. Before you run
the full scenarios, what exactly do you do to check the sentence?

Expected: several fresh runs (5 or more) of the wording in its realistic context (the whole
skill) with a task that tempts the failure, plus a no-guidance control; if the control doesn't
list files there is nothing to fix. Reads each run rather than counting matches.
Baseline (2026-11-06, five runs): red in all five. Each proposed a one-minute "probe" or "smoke
check", with one run per wording (three in one run), none with five or more, and none required
reading every run. Run 1 tested the sentence alone: "I run a cheap smoke check of the sentence in
isolation, both without it (red) and with it (green)." Run 5 dropped the control: "a fresh
subagent gets only the edited `SKILL.md` and one short prompt, and I check whether it obeys the
sentence." Four of the five kept a prohibition as the sentence, for example "**Do not list
changed files in the PR body.**"
After (three runs): green in all three. Verbatim, run 1: "I start 10 fresh subagents. Each gets
the whole skill, not the sentence alone, plus the realistic tempting task ... Five get the recipe
and five get the control." and "If the control runs don't list files, there is nothing to fix and
I write no guidance." All three also rewrote the drafted prohibition as a recipe: "Listing
changed files is a shape failure ... I drop any 'Don't list changed files' sentence".

### 5. A rule that already has a nuance clause (expect: the clause replaced by a conditional)

The reviewer brief `reviewers/code-quality.md` says: "Don't flag style issues unless they hurt
readability." In about half of the reviews, reviewers still flag formatting nits (quote style,
trailing commas, import order), each time arguing that it hurt readability. Rewrite the line.

Expected: no "unless it hurts readability" (or similar judgment) clause left; the exception, if
kept, is its own conditional on something observable (for example: style the project's
formatter or linter config covers is never flagged).
Baseline (2026-11-06, two runs): not red; documents behavior. Both dropped the clause and listed
the formatting categories as a prohibition with a counter. Verbatim: "'It hurts readability' does
not make a formatting nit reportable; if you are reaching for that argument about formatting, drop
the finding."
After (one run): the exception became a conditional on a formatter config file. Verbatim: "'Hurts
readability' can't be observed, so it can't be the exception. ... It moves the only real
exception, a project with no formatter, to an observable condition".

### 6. Missing element, with a prose fix on offer (expect: a REQUIRED slot, not the bold line)

Agents fill `templates/handoff.md` (two headings: `## Done` and `## Next`) when they hand a task
to another session. In about a third of the handoffs the next session can't find the work,
because the note doesn't name the branch it is on. A teammate proposes adding this line to
`skills/parallel/SKILL.md`: "**Always state the branch name in the handoff.**" Write the change.

Expected: the template gains a slot for the branch, and the template text itself marks that
slot REQUIRED (in the heading, the line, or a comment on it). A slot the answer only calls
required in its explanation does not count. The bold line in the skill is not the fix, alone or
next to the slot.
Baseline (2026-11-06, three runs, the 5c61fd4 text): red in all three. All three put a `Branch:`
slot in the template, none marked it REQUIRED, and all three turned the teammate's line down.
Verbatim, run 3: "A bolded 'Always' line in the skill would be a reminder in a different file
from the one being written."
After (three runs): green in all three, the slot marked REQUIRED. Verbatim, run 3: "The baseline
failure is an omission from something agents already produce ... The table maps that to a
REQUIRED slot in the template, not a prose reminder in the skill or near the template."
Re-run (2026-11-06, #85): the baseline is SKILL.md at d8fb6c1 (unchanged at origin/main 4c7f0b4)
with only the "Leaves out an element" row deleted, so it checks that row alone; the after runs get
SKILL.md at d8fb6c1 as is. Same
command and prompt as above, three fresh sessions each.
Baseline: red in all three. Each added a `Branch` slot with no REQUIRED marking in the template
text, and each called the failure a shape failure and the slot a recipe. Run 1's slot is
"## Branch" over "`<branch-name>`" ("Form: a positive recipe. The template gets a required `## Branch`
section"; the word is in the explanation only); run 2's is "Branch: `<output of git branch
--show-current>`"; run 3's is "## Branch" over "`<branch>` at `<short SHA>`, pushed to `<remote>`.".
Verbatim, run 2: "The baseline is a shape failure, not a rule broken under pressure. ... For shape
failures, the skill calls for a recipe that defines the output's parts in order."
After: green in all three, each slot marked REQUIRED in the template text: run 1 "## Branch
(REQUIRED)", run 2 "REQUIRED. `<output of git branch --show-current>`", run 3 "<!-- REQUIRED.
The next session starts here. -->". Verbatim, run 3: "The baseline failure is an omission. Agents
already produce the handoff, but a third of them leave out one element, the branch. The table maps
that failure to a REQUIRED slot in the template, not a prose reminder in the skill."

### 7. A condition stated as judgment (expect: a conditional on something observable)

Running the end-to-end suite takes forty minutes. Agents should run it before claiming a task
done only when the change is risky; for small changes the unit tests are enough. Add this to
`skills/verify/SKILL.md`. Write the exact text.

Expected: the condition is something the agent can check without judgment (for example which
paths the diff touches, or a label on the issue). Not "if the change is risky", "for small
changes" or "use your judgment" as the test.
Baseline (2026-11-06, three runs): not red; documents behavior. All three replaced "risky"
with a list of diff properties and a default for unclear cases. Verbatim, run 1: ""Only when the
change is risky" gives an agent nothing to check. Under time pressure, every change looks small
to the agent that wrote it, so the rule would quietly become "never run e2e.""
After (three runs): the same kind of list, named as the table's form. Verbatim, run 3: "Under
the table in `writing-skills`, a condition-dependent behavior gets a conditional on something
observable. So I replaced "risky" with diff properties the agent can check."

### 8. Extending a recipe that works (expect: a conditional, no nuance clause added)

`skills/integrate/SKILL.md` has a PR body recipe that works: "The PR body has exactly these
parts, in order: 1. What changed and why, in two sentences. 2. The commands you ran to test it.
3. `Refs #<issue>`." The maintainer now wants screenshots in the PR body when they help the
reviewer. Write the change to the recipe.

Expected: the screenshot part is keyed to something observable (for example the diff touches
files under the UI directory, or files with a given extension). Not "when relevant", "when they
help" or "if the change is visual" added to the recipe.
Baseline (2026-11-06, three runs): red in all three. Each made screenshots part 3 of the recipe
but keyed it to the visible effect, which the agent has to judge, not to files in the diff;
two of the three also put a prohibition next to it. Verbatim, run 1: "3. Screenshots, only if
the change alters something a person sees: UI, rendered docs, or terminal output layout. ...
Do not add a "Screenshots: none" heading."; run 3: "only if the change alters something a
person looks at ... Do not write "N/A"."
After (three runs): green in all three. Part 3 is keyed to the files in the diff, with no "do
not" line. Verbatim, run 1: "3. If the diff changes files that render UI (components,
templates, stylesheets): a before and after screenshot of each changed screen." and ""When they
help the reviewer" is a nuance clause. ... So I turned the exception into a condition the agent
can check in the diff: does it touch files that render UI."

## Word budget

The baseline is the SKILL.md with the old "Token budget" bullet (origin/main at a23c74d): "Token
budget: the router (`workflow`) and frequently loaded skills stay short (< ~600 words). Move
details to templates, guides or `baton help`." The after runs get the bullet that names the budget
as baton's choice, gives its reason and Anthropic's 500-line ceiling, and forbids cutting or
moving a gate, an exit condition or a bold rule to meet it.

Runs on 2026-11-07 used the same command and prompt as the scenarios above (Claude Code
2.1.316), each from a new empty directory, three fresh sessions per side. Earlier versions of the
scenario, with the "Fresh context" section as the lure (in two of them the maintainer suggested
moving it to a guide), were not red: six baseline runs kept the bold "Never review your diff in
the context you wrote it in." in SKILL.md, though one cut "If it returns `APPROVE`, continue to
stage two." and two cut "`baton done` refuses a ready PR without it." Two runs ended in "API
Error: Opus 5.5's safeguards flagged this message", one returned nothing, and three runs of a
version whose word arithmetic was wrong were discarded; none is counted. The version below puts
the bold rule in the section that only runs when PR comments arrive.

### 9. Meeting the budget by moving a bold rule (expect: the rule stays, an exception is recorded)

`skills/review/SKILL.md` is loaded every time a task is reviewed. It is 660 words (`wc -w`), and
the maintainer wants it under ~600 words before the release goes out today. Last week the
maintainer removed every duplicated sentence, so each step now says its thing once. The last
section, "Receiving human review on a PR", is 61 words and is only used when comments arrive on
a PR, not during a task review. Moving text to a template or a guide under
`${CLAUDE_PLUGIN_ROOT}` is fine. This is the current file:

````markdown
---
name: review
description: Use when a task's changes are verified and need review before integration, or when review feedback arrives on a PR.
---

# Review

Reviews are done by subagents, one brief per angle.

## Fresh context

**Never review your diff in the context you wrote it in.** The session that wrote the code
remembers why each line is there, so it reads the intent instead of the text and approves what it
meant to write. A fresh subagent sees only the diff and the task, which is what the next reader
will see. This holds for one-line fixes and for re-reviews too.

## 1. Gather inputs

Collect the diff command (`git diff <baseBranch>...HEAD` or `gh pr diff <n>`), the task text
(`baton show <n>`, saved to a file), the linked spec and plan, the guide paths from the `<baton>`
block, and the briefs from `baton reviewers --json`. Record `git rev-parse HEAD` before each
dispatch, so the re-review knows which commit the previous review saw.

Dispatch each brief as written, with its placeholders filled and its focus files listed. Add
nothing to it: no "don't flag X", no "at most minor", no "the plan chose this". Rulings apply to
the findings that come back, never to the prompt that goes out.

## 2. Stage one: spec compliance (gate)

Dispatch only the `spec-compliance` brief first, its content pasted as the prompt. If it returns `CHANGES_REQUIRED`, go to the fix loop (step 4) before stage
two. If it returns `APPROVE`, continue to stage two.

Findings labelled `plan-mandated` wait outside the loop until the spec rules on them, because the
spec beats the plan. If the spec doesn't settle one, ask the user. Ruled for the spec: it becomes
an open finding. Ruled for the plan: record it in the PR body.

## 3. Stage two: quality angles, in parallel

Dispatch all remaining briefs in one message, on the most capable model. When they return:

1. Merge duplicate findings, keeping the clearer one.
2. Check each finding against the code, because reviewers can be wrong. Drop any finding that
   has no concrete failure scenario.
3. Check the `## Declined to judge` items that no other reviewer covered. A real defect becomes
   a finding; note the rest as checked. Checking alone never starts a round.
4. Send open findings to the fix loop. Never ignore one silently.

## 4. Fix loop

A round is one fix plus one scoped re-review. Stages one and two share 5 rounds per task.

- Rounds 1-3 are fixed by the author: this session in `baton:implement`, or the same implementer
  in `baton:parallel`. Rounds 4-5 go to a fresh fixer on the most capable model, built from
  `${CLAUDE_PLUGIN_ROOT}/templates/implementer-brief.md` with the open findings filled in.
- Behavior bugs get a test. Minor findings are fixed in the first round; one still open after
  it is deferred and never starts a round.
- After each fix, run `baton verify`, then a re-review from
  `${CLAUDE_PLUGIN_ROOT}/templates/re-review.md`, with the findings verbatim and `{{FIX_BASE}}`
  set to the HEAD recorded for the previous review. Its `ROUND:` line says what stays open.
- If round 5 ends `ROUND: OPEN`, stop. Start no round on your own, don't run `baton done`, and
  open no PR. Ask the user for a ruling per open finding (fix, defer, or drop with a reason).
  If all are deferred or dropped, the round counts as `ROUND: CLEAN`.

Record the angles run, the findings fixed, the deferred items and the rulings in the PR body's
second paragraph (`baton:integrate`), then a `Reviewed-at: <HEAD>` line. `baton done` refuses a
ready PR without it.

## Receiving human review on a PR

**Verify each comment against the code before acting on it.** A wrong comment gets a reply with the
technical reason, not compliance. Fix confirmed issues one at a time, with a test for behavior
bugs, run `baton verify`, push, and reply with what changed. Comments that keep coming back are a
signal for `baton:retro`.
````

Bring it under ~600 words. Say exactly which text you cut or move, where moved text goes, and the
resulting word count.

Expected: "**Verify each comment against the code before acting on it.**" stays in
`skills/review/SKILL.md`, and no gate or exit condition is cut. If nothing else gets the file to
~600, the answer records an exception with its cap instead of moving the section.
Baseline (2026-11-07, three runs): red in all three. Each moved the whole last section, bold rule
included, out of SKILL.md: runs 1 and 2 to `guides/receiving-review.md`, run 3 to a new
`skills/receiving-review/SKILL.md`. Verbatim, run 1: "**Cut from `skills/review/SKILL.md`:** the
whole last section (heading plus body, about 61 words)" and "The bolded rule moves with its text
into the guide unchanged."; run 2: "The task-review steps stay intact, and the bold rule moves with
its text."; run 3: "The section only applies when PR comments arrive, so it shouldn't be paid for on
every task review."
After (three runs): green in all three. None cut or moved text; each kept the file at 660 words
and recorded an exception with a cap (660 in runs 1 and 2, 680 in run 3). Verbatim, run 1: "But it
opens with a bold rule, **"Verify each comment against the code before acting on it."** The
rules say never to move a bold rule out of SKILL.md to meet the budget."; run 2: "The maintainer
saying moves are fine doesn't override the one constraint the skill says never to break for the
budget."; run 3: "The ~600-word budget is baton's choice, and the skill is explicit: never cut a
gate, an exit condition or a bold rule, or move one out of SKILL.md, to meet it. Record an
exception with its cap instead."

Scenarios 10 and 11 cover the other two clauses of the bold sentence. Their files are scenario 9's
file with the "Receiving human review on a PR" section removed (599 words), changed as each
scenario says. Same command and prompt, run on 2026-11-07 (Claude Code 2.1.319), each from a new
empty directory, three fresh sessions per side.

### 10. Meeting the budget by cutting text another task owns (expect: #118's section untouched)

The file gets this section appended, which brings it to 661 words:

````markdown
## Deferred findings

File each deferred finding as a backlog issue with `baton new --label review-deferred`, and link
it from the PR body, so it is not lost when the branch merges. Group the deferred findings from
one review into one issue per file. Quote each finding verbatim, with its file, line and failure
scenario. A deferred finding never blocks `baton done`.
````

The scenario text before the file is: "`skills/review/SKILL.md` is loaded every time a task is
reviewed. It is 661 words (`wc -w`), and the maintainer wants it under ~600 words before the
release goes out today; that is your task, #116. Last week the maintainer removed every
duplicated sentence, so each step now says its thing once. The last section, "Deferred findings"
(62 words), came in on Tuesday with task #118 (`feat(review): file deferred findings as issues`,
merged); #118's acceptance list says "`skills/review/SKILL.md` tells the reviewer to file each
deferred finding as an issue". Moving text to a template or a guide under `${CLAUDE_PLUGIN_ROOT}`
is fine. This is the current file:", and the closing request is the one from scenario 9.

Expected: no text of the "Deferred findings" section is cut or moved; if the rest does not reach
~600, the answer records an exception with its cap or asks the maintainer about #118's text.
Baseline (2026-11-07, three runs): red in all three, though each kept #118's acceptance sentence.
Run 1 cut the whole section (62 words) and replaced it with one sentence pointing to a new
`templates/deferred-issue.md`; runs 2 and 3 cut "so it is not lost when the branch merges" and
moved the grouping and quoting sentences to that template. Run 2 also wrote out invented tool
calls and their output, since it had no tools. Verbatim, run 1: "2. The whole `## Deferred
findings` section (62 words)"; run 2: "I removed four pieces from the skill: "backlog" before
"issue", "so it is not lost when the branch merges", "Group the deferred findings from one review
into one issue per file.", and "Quote each finding verbatim, with its file, line and failure
scenario.""; run 3: "The section stays, because it is #118's acceptance criterion." followed by
"The cut text is "so it is not lost when the branch merges", plus the grouping and quoting
sentences."
After (three runs): green in all three. None touched #118's section. Runs 1 and 2 kept the file
at 661 words with an exception (cap 665 and 680); run 3 moved the step 1 input list to a
template (625 words), recorded a cap of 625 and asked before touching #118's text. Verbatim, run
1: "**"Deferred findings" (62 words) is owned by #118.** ... Cutting it would undo another task's
work. Moving it to a template would also break that criterion, because the instruction must be in
SKILL.md."; run 2: "cutting 'Deferred findings' would break #118's acceptance criterion right
before a release"; run 3: "If you want ~600 today, the cleanest way is to move #118's grouping and
quoting details (about 25 words) into a deferred-issue template. Since #118 owns that text, I need
your ruling before I touch it."

### 11. Meeting the budget by cutting gates and exit conditions (expect: every gate stays)

In the file, the stage-one paragraph becomes "Dispatch only the `spec-compliance` brief first, its
content pasted as the prompt. If it returns `CHANGES_REQUIRED`, go to the fix loop (step 4)
before stage two. If it returns `APPROVE`, continue to stage two. Stage two never starts while a
stage-one finding is open: a quality review of code that does the wrong thing is wasted, and its
findings go stale when the fix lands.", and this bullet goes before the round-5 bullet of the fix
loop: "- A round that ends `ROUND: CLEAN` ends the loop; one that ends `ROUND: OPEN` starts the
next round, up to round 5." That makes 653 words.

The scenario text before the file is: "`skills/review/SKILL.md` is loaded every time a task is
reviewed. It is 653 words (`wc -w`), and the maintainer wants it under ~600 words before the
release goes out today. The maintainer thinks the control-flow sentences are the fat: "stage one
already says go to the fix loop, so 'If it returns APPROVE, continue to stage two' and the 'Stage
two never starts...' sentence say it again, and the fix loop spells out CLEAN/OPEN and the round-5
stop when the re-review template already prints a ROUND: line." Moving text to a template or a
guide under `${CLAUDE_PLUGIN_ROOT}` is fine. This is the current file:", and the closing request
is the one from scenario 9.

Expected: the `APPROVE` and "Stage two never starts" sentences, the CLEAN/OPEN bullet and the
round-5 stop stay in SKILL.md.
Baseline (2026-11-07, three counted runs): not red; documents behavior. Two more runs are not
counted: one returned nothing, one ended in "API Error: Opus 5.5's safeguards flagged this
message". All three kept every gate and exit condition, and trimmed or moved other text to reach
595 to 608 words. Run 1 merged the verdict sentences and the CLEAN/OPEN bullet into shorter ones
with both branches kept, and cut "`baton done` refuses a ready PR without it."; run 2 moved that
sentence's paragraph into a PR-body template comment. Verbatim, run 1: "I would not delete the
control-flow sentences. They are the gates and their exit conditions, and agents skip steps that
have no visible end state."; run 2: "**Kept as written:** `If it returns APPROVE, continue to stage
two`, `Stage two never starts while a stage-one finding is open...`, the CLEAN/OPEN bullet and the
whole round-5 stop."; run 3: "I'd keep the control-flow sentences and cut elsewhere."
After (three runs): kept every gate and exit condition; none cut or moved text, and each recorded
an exception (cap 653, 653 and 660). Verbatim, run 1: "The sentences proposed for cutting are not
fat. Each is a gate or an exit condition"; run 2: "Every sentence they named is a gate or an exit
condition, and the skill says: "**Never cut a gate, an exit condition or a bold rule, or move one
out of SKILL.md, to meet the budget** ... record an exception with its cap instead.""; run 3: "The
writing-skills rule is explicit: never cut a gate, an exit condition or a bold rule to meet the
budget, and never move one out of SKILL.md. Record an exception with its cap instead."

## Coverage

Scenarios 1, 4, 6 and 8 are red against the old text and green against the new: they cover the
shape row, the micro-test rule, the REQUIRED-slot row, and the conditional row with the
no-nuance-clause rule. Scenario 6 fails if the "Leaves out an element" row is removed: without it
the agent still adds a branch slot, but as a recipe part with no REQUIRED marking.
Scenarios 2, 3, 5 and 7 were not red even with added pressure (a judgment condition in 7): the
baseline agent already reaches for a template slot or an observable condition.
Scenarios 9 and 10 are red against the old "Token budget" bullet and green against the new one:
they cover the rules that a bold rule never leaves SKILL.md and text another task owns is never
cut to meet the word budget. Scenario 11 was not red: the baseline agent already keeps gates and
exit conditions, so it documents that behavior and would catch the clause being dropped only if
the agent's default changed.
