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

Expected: the template gains a slot for the branch (for example `Branch: <name>` marked
REQUIRED). The bold line in the skill is not the fix, alone or next to the slot.
Baseline (2026-11-06, three runs): not red; documents behavior. All three put a `Branch:` slot
in the template, none marked it REQUIRED, and all three turned the teammate's line down.
Verbatim, run 3: "A bolded 'Always' line in the skill would be a reminder in a different file
from the one being written."
After (three runs): the same, with the slot marked REQUIRED. Verbatim, run 3: "The baseline
failure is an omission from something agents already produce ... The table maps that to a
REQUIRED slot in the template, not a prose reminder in the skill or near the template."

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

## Coverage

Scenarios 1, 4 and 8 are red against the old text and green against the new: they cover the
shape row, the micro-test rule, and the conditional row with the no-nuance-clause rule.
Scenarios 2, 3, 5, 6 and 7 were not red even with added pressure (a prose fix offered in 6, a
judgment condition in 7), so nothing here fails if the REQUIRED-slot row is removed: the
baseline agent already reaches for a template slot.
