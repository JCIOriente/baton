# Decision points — Spec

- Status: approved 2026-11-14
- Date: 2026-11-10
- Owner: Arnold Gandarillas
- Related: #134, #135 (builds on this), #133 (separate spec); upstream obra/superpowers
  `skills/brainstorming/SKILL.md`, `skills/writing-plans/SKILL.md`,
  `skills/subagent-driven-development/SKILL.md` at 22f0b46 (v7.0.2, baton's current baseline)

## TL;DR
- Choosing a technology, dependency or architecture new to the repo, or user-visible behavior, is
  the **user's call** in every phase, even when the request only describes outcomes. The agent
  presents options with its lean and waits; it never decides these and writes them down as
  defaults. Building on what the repo already uses needs no question.
- `baton:spec` gets back the order superpowers' brainstorming enforces and baton lost when it
  condensed the skill: approaches in a message of their own, the user picks, and only then a
  worktree, spec file, ADR or builder check.
- `baton:plan` ends by asking the user to approve the plan **and** choose how to run it.
- During implementation, a choice of that kind that the spec and plan don't settle stops the work
  and goes to the user. That includes any choice that crosses a module or package boundary, or
  contradicts or extends what the spec says the user sees. Anything inside a module is decided
  and logged as a **ruling**, which reaches the user in the PR body.
- The rule is also an always-on line in the session context, so it holds when no skill is loaded.

## Change in a nutshell
The request from #134: "spec the migration of the design-system bundle to TSX components; settle
the build tool, type strategy and migration order as recommendations for the owner to approve."

Today the agent reads the code, picks Vite library mode, a hand-kept `.d.ts` and a five-group
migration, writes the spec, an ADR and a glossary row in a worktree, runs a builder check, and
leaves four taste calls at the end.

After this change, its message after reading is a decision brief and nothing else:

```text
Three decisions shape this. For each: the options, what they trade off, my lean.

1. Bundler for the IIFE build: Vite library mode | esbuild | Rolldown. Lean: Vite, because ...
2. Types: hand-kept .d.ts + conformance check | emitted declarations + bundler. Lean: ...
3. Migration: big-bang | staged by component family. Lean: staged, because ...

Which way on each? Nothing is written until you pick.
```

No worktree, file or subagent exists until the user answers. In general: a request that asks for
recommendations, proposals or options, or that raises how something gets built, gets the options
with a lean. A request that talks only about outcomes hands the agent the internal design, never
a technology, dependency or architecture new to the repo: those still get options with a lean.
Each choice the agent makes is stated in one line and recorded as the author's call.

## Problem
Agents in baton repos decide technology and architecture questions without the user and present
the result as finished work (#134). It costs tokens on work the user discards (a full spec, ADR
and builder check on choices nobody agreed to) and hides the real decisions as defaults.

Cause: `baton:spec` was adapted from superpowers' brainstorming but kept only "propose 2-3
approaches" (`skills/spec/SKILL.md:32`). It dropped the order that makes the user pick before
anything is written (brainstorming lines 26-32), the rule for reading who owns the how (lines
121-129) and the red flags (lines 285-294). It kept "process steps (write-up, file paths, more
reading) are yours: do them" (`skills/spec/SKILL.md:25`), which without the order reads as
permission to draft. The hard gate covers only implementation (`skills/spec/SKILL.md:9`).
Beyond spec: `baton:plan` asks for approval only after the plan is written and never asks how to
run it (`skills/plan/SKILL.md:50`); `baton:parallel` lets the controller settle concerns itself
(`skills/parallel/SKILL.md:52`); and the always-on rules only cover ambiguity
(`cli/lib/context.mjs:12`), which an agent sure of its pick doesn't feel.

## Goals / Success criteria
- Given #134's request, `baton:spec` asks the user to pick before any `Write`/`Edit` or
  `baton worktree add` (checked by the eval in Testing strategy).
- Every spec written from the template has an Approaches section naming the option the user
  picked; choices the user didn't make are marked as the author's call.
- `baton:plan`'s last step asks the user to approve the plan and choose a run method, with a
  recommendation and its reason.
- An implementer or controller that meets a user's-call choice the spec and plan don't settle
  stops and asks; every other judgement it makes appears as a ruling in its report and in the PR
  body.
- The session context's always-on rules include the user's-call rule.

## Non-goals
- #133 (controller context budget, session handoffs): its own spec.
- #135 (frontend stack preset and component-by-component design) and #137 (engineering standard:
  stack presets, layout and quality gates). Both build on this rule.
- Superpowers' visual companion and spikes: not ported here.
- Any CLI enforcement (a hook that blocks writes before a pick). This is skill guidance plus one
  context line.

## Users & permissions
n/a: no roles. "The user" is whoever drives the session, usually the repo owner.

## Tenancy & localization
n/a.

## Domain model
- **User's call**: a choice of technology (library, tool, framework) or a dependency (add,
  replace, upgrade) new to the repo, architecture (structure across modules or packages, a public
  interface or data shape between them) or user-visible behavior. It stays the user's even when
  the request only describes outcomes. Only the user decides these; the agent proposes 2-3
  options with trade-offs and its lean. Not a user's call: building on what the repo already
  uses, meaning something in its manifest or lockfile, a module or package boundary it already
  has, or a pattern its code already follows.
- **Author's call**: a choice the agent made that is not a user's call, including the internal
  design an outcome-only request hands over. Stated out loud and marked as the agent's, never as
  agreed.
- **Ruling**: an author's call made during implementation, recorded as
  `Ruling: <what> — <why> — <cost if wrong>`. The line with a user's call: a choice that crosses
  a module or package boundary, or contradicts or extends what the spec says the user sees, is a
  user's call; anything inside one module (names, internal signatures, error text the spec
  doesn't set, helper structure) is a ruling. "Extends" means a new screen, command, option,
  flow or state the spec doesn't describe; the wording of a message for a case the spec already
  covers is not an extension.

## Interfaces
Files that change and what each gains:

1. `skills/spec/SKILL.md` (ported from brainstorming, kept in baton's style):
   - A required order stated before the steps: lay out the approaches in a message of their own,
     the user picks, write the spec, the user approves. Steps 6-9 (worktree, write, ADRs,
     builder check) only after the pick.
   - Step 4 rewritten: drop weak options, sketch the 2-3 that remain with trade-offs and a lean,
     ask which way; when one is sensible say why the others don't fit and still wait.
   - The how rule from brainstorming lines 121-129, with #134's wording added: "recommend",
     "propose", "options", "for the owner to approve" in a request mean options with a lean.
     Baton's limit on it: an outcome-only request hands over internal design only; a technology,
     dependency or architecture new to the repo still gets options with a lean.
   - Step 3's process-steps sentence stays, now bounded by the order.
   - Step 5 gains brainstorming's play-back rule: only what the user said goes in as theirs;
     what the agent filled in goes in as its proposal with a reason.
   - The hard gate also names installing dependencies and creating projects.
   - A red-flags table: brainstorming's "fill in sensible defaults", "answered their questions,
     so write the doc", "they said sounds good", plus "the request said recommend, so I'll
     decide and note it".
2. `templates/spec.md`: an `## Approaches` section after Non-goals (options considered,
   trade-offs, the one the user picked and why), and a self-review line: every choice the user
   didn't make is marked as the author's call.
3. `skills/plan/SKILL.md` step 9: ask the user to approve the plan and choose how to run it:
   subagents in this session (`baton:parallel`), one task at a time in this session
   (`baton:implement`), or separate sessions or developers (`baton start <n>` each). Recommend
   one with a one-sentence reason from the plan (how coupled the tasks are, how many, what a
   mistake costs). If the user already named a method, only ask for approval.
4. Execution stop rule:
   - `templates/implementer-brief.md`: a user's-call choice the task text and spec don't settle
     ends the run with `STATUS: NEEDS_CONTEXT` and the options with a lean. The brief states the
     line from Domain model in one sentence: stop for a choice that crosses a module or package
     boundary, adds a technology or dependency new to the repo, or contradicts or extends what the
     spec says the user sees. Other judgements are made and listed as rulings in the report, for
     every status that includes commits.
   - `skills/implement/SKILL.md`: the same rule for an agent implementing in its own session; it
     asks the user directly.
   - `skills/parallel/SKILL.md`: a `NEEDS_CONTEXT` question that is a user's call goes to the
     user, never answered by the controller; `DONE_WITH_CONCERNS` concerns that are user's calls
     likewise; `BLOCKED` with a wrong plan already escalates.
5. `templates/pr-body.md` and `skills/integrate/SKILL.md` step 2: the first paragraph lists the
   rulings (the deviations it already mentions, made explicit). The two-paragraph limit stays.
6. `cli/lib/context.mjs` `ALWAYS_RULES`: a new rule after the ambiguity rule:
   "A technology, dependency or architecture new to the repo, or user-visible behavior, is the
   user's call even when the request only describes outcomes: present 2-3 options with your lean
   and wait. Never pick one and write it down as decided."
7. `provenance.json`: no change; brainstorming → spec and writing-plans → plan are already
   mapped, and the baseline stays 22f0b46.

## Behavior & edge cases
- **Nothing open, one sensible way:** the first message carries the approach, why others don't
  fit and the short design, and asks for approval (brainstorming lines 70-76). Still no file
  before the answer.
- **User says "just decide" / "your call":** the agent decides, states each choice in one line,
  and records them as author's calls. The order still holds: the line is said before writing.
- **User explicitly skips the spec phase:** unchanged (`skills/workflow/SKILL.md:46-47`).
- **Outcome-only request ("make the export faster"):** the agent designs the internals itself and
  states them as author's calls; if the best route needs a library, tool or structure the repo
  doesn't have yet, that one choice goes to the user with options and a lean. Reusing a
  dependency already in the lockfile needs no question.
- **Dependency choice inside a task:** `baton:deps` already governs adding one; picking *which*
  package when the plan didn't name it is a user's call under this rule.
- **Choice inside one module during a task** (a name, an internal signature, error text the spec
  doesn't set, how helpers are split): a ruling, never a stop. The same choice becomes a stop when
  it changes a module's public interface used by another module or package.
- **Subagent can't reach the user:** it never can; it returns `NEEDS_CONTEXT` and the controller
  asks. A controller running unattended (a Workflow) parks that task and continues others
  (author's call).
- **No rulings:** the PR body says nothing about rulings; no empty heading (the template has
  none).
- **Implement and integrate in different sessions:** an implementer that pauses or hands off
  lists its rulings in the handoff comment `baton:implement` already posts on the issue;
  `baton:integrate` takes them from the report in the same session, or from that comment
  (author's call: no new storage).

## Data & migrations
None. Specs written before this keep their shape; the Approaches section applies to new specs.

## Testing strategy
- `make ci`: a test in `cli/test/features.test.mjs` that the user's-call rule is in
  `ALWAYS_RULES` and printed under "Always, even without loading a skill", like the deps rule
  test at line 78; `claude plugin validate .` covers the edited skills.
- New eval `evals/spec-recommendations/` (paid, `make evals`, not in ci): #134's request in a
  scaffolded baton repo with a small bundle file, `allowed_tools` including `Write`, `Edit` and
  `Bash`, and `max_turns` raised to 15 so a run that is still reading can't pass by running out of
  turns (author's call). Graders: `baton:spec` fired; `Write` and `Edit` used 0 times and no
  `Bash` call matching `worktree add` (`tool_used` with `min: 0, max: 0`, as in
  `evals/deps-question-no-change`); an LLM grader that the final message presents options for
  the decisions with a lean and asks the user to pick.
- `spec-new-feature` and `plan-approved-spec` still pass (trigger wording unchanged).

## Approaches
Settled with the owner on 2026-11-10 before this was written:
- **Port superpowers' wording vs rewrite tersely:** port, close to verbatim, so provenance
  keeps tracking upstream; the terse rewrite is how the order got lost. Picked by the owner.
- **Execution: decide-and-log (superpowers) vs stop for user's calls:** stop for user's calls,
  log the rest. Superpowers runs fully autonomous because its gates hold; baton's case (#134) is
  the user wanting those calls. Picked by the owner.
- **Rule only in skills vs also always-on:** also always-on, so it holds without a skill loaded,
  at one line of context per session. Picked by the owner.
- **Rulings in report + PR body vs issue comments:** report + PR body; no new machinery and the
  user sees them at review. Picked by the owner.

Settled with the owner on 2026-11-14, from the builder check:
- **Outcome-only requests: new technology still the user's, always the user's, or handed over:**
  new to the repo stays the user's call; building on what the repo uses needs no question; the
  request hands over internal design only. "Always" would stop routine work; "handed over" is
  #134's failure whenever a request happens to be worded as outcomes. Picked by the owner.
- **Where a stop ends and a ruling begins: boundaries and user-visible, anything public, or only
  contradictions:** a module or package boundary, or a contradiction or extension of what the
  spec says the user sees; everything inside a module is a ruling. "Anything public" stops on
  every exported name; "only contradictions" lets structural choices reach the user first at PR
  review. Picked by the owner.

## Decisions
No ADR: only baton's own skills depend on this. New terms (user's call, author's call, ruling)
go in `CONTEXT.md`.

## FAQ
### Why not drop the reading before the brief, as #134 point 4 suggests?
Superpowers says the opposite (read until you can explain how the parts work), and over-reading
wasn't the failure; deciding without the user was. The brief needs the reading to name real
options.

### Why not a hook that blocks writes until the user picks?
Nothing machine-checkable marks "the user picked". A hook would need a flag the agent sets
itself, which guards nothing.

## Open questions
None.

## Implementation status
- [x] plan: [docs/plans/2026-11-14-decision-points.md](../plans/2026-11-14-decision-points.md)
- [x] #139 `baton:spec`, spec template, eval (PR #147)
- [x] #140 `baton:plan` step 9 (PR #146)
- [x] #141 implementer brief, `baton:implement`, `baton:parallel` (PR #148)
- [x] #142 PR body and `baton:integrate`, review's "decision" (PR #149)
- [x] #143 always-on rule (PR #144)
- [x] `make evals` run once with the new `spec-recommendations` case (2026-11-14: all 21 cases pass; spec-recommendations 0.93, one run's options-with-lean judge split 1-2 on a message that did give options and leans)
