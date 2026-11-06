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
