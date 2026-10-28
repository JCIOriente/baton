---
name: retro
description: Use after a task is merged or a PR review round ends in a baton repo, when the user corrects the same thing twice, or when asked "what did we learn", to capture lessons where every contributor and agent will see them.
argument-hint: "[task number]"
---

# Retro

Baton improves through the repo, not through private memory. A lesson only counts once it
lands where every contributor, human or agent, on any machine, will read it: the project's
conventions, an ADR, a stack guide, or a task template. Every change is reviewed like code.

## 1. Collect the evidence for this task

- Review findings that were fixed (`blocker`/`major`), and the angle that found them
- Verification failures that took more than one attempt
- User corrections during the task ("no, we do X here")
- Things the plan or spec got wrong: missing tasks, wrong boundaries, wrong estimates
- Questions an implementer had to ask, which mean context was missing from the issue

No evidence, no lesson. "Write cleaner code" is not a lesson.

## 2. Turn evidence into lessons

For each item, decide where it belongs:

| It is about... | Write it to |
|---|---|
| How this project does something (naming, a pattern, a rule) | the project's conventions file (`conventions` in `.baton/config.json`) |
| A bug pattern that keeps recurring (same mistake, different places) | `docs/common-issues.md` (`docs.commonIssues`): symptom, cause, how to avoid it. Agents read it before coding |
| A decision that later specs will have to follow | a new ADR in `docs/adr/` |
| Domain vocabulary that was misunderstood | `CONTEXT.md` (the glossary) |
| A gap in a baton stack guide, reviewer or skill (applies to any project) | an issue on the baton repo, with the evidence |
| A missing field in task issues | the project's task template, or a baton issue |

Write each lesson as a rule an agent can apply, with the reason behind it.

## 3. Weigh it

- A lesson seen **once** goes in a PR comment starting with "Lessons:" as a candidate. Don't
  turn it into a rule yet.
- A lesson seen **twice or more** (search earlier PRs' "Lessons:" comments and review
  comments) becomes a rule now.
- Never encode a lesson that contradicts the spec, an ADR or an existing convention without
  raising the conflict with the user.

## 4. Propose, don't impose

Put convention, ADR and glossary edits in a small separate PR (or in the current task's PR,
if it isn't merged yet), titled `docs: lessons from #<n>`. The user or a reviewer approves it
like any other change. For baton-level lessons, draft the issue text and ask the user before
filing it on the baton repo.
