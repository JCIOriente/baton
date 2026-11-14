# Decision points — Implementation Plan

- Spec: [docs/specs/2026-11-10-decision-points.md](../specs/2026-11-10-decision-points.md)
- Date: 2026-11-14
- Status: done (#139-#143 merged)

## Overview
Five tasks, cut by file ownership, one per item group in the spec's Interfaces. None depends on
another: each states the same rule in a different file, and the shared wording (the terms, the
ruling line, the always-on sentence) is fixed by the spec and `CONTEXT.md`, which merged with the
spec. All five can run in parallel.

- T1: `baton:spec` (order, approaches, how rule, play-back, hard gate, red flags), the spec
  template's Approaches section, and the new eval
- T2: `baton:plan` step 9 (approve the plan and choose how to run it)
- T3: the execution stop rule in the implementer brief, `baton:implement` and `baton:parallel`
- T4: rulings in the PR body (`templates/pr-body.md`, `baton:integrate` step 2)
- T5: the always-on line in `cli/lib/context.mjs` and its test

Skill text changes follow the repo's `writing-skills` skill: each task records a baseline
scenario run before the edit and the same run after, in `tests/skills/<skill>.md`.

## Contract
None (no API). Shared wording every task uses as written, never paraphrased into a new term:
- Terms: **user's call**, **author's call**, **ruling** (`CONTEXT.md`).
- Ruling line: `Ruling: <what> — <why> — <cost if wrong>`.
- The stop line (T1, T3): stop for a choice that crosses a module or package boundary, adds a
  technology or dependency new to the repo, or contradicts or extends what the spec says the user
  sees. "Extends" means a new screen, command, option, flow or state the spec doesn't describe.
- The always-on sentence (T5), exactly: "A technology, dependency or architecture new to the repo,
  or user-visible behavior, is the user's call even when the request only describes outcomes:
  present 2-3 options with your lean and wait. Never pick one and write it down as decided."

## Impact
- **Affected call paths and consumers:** `ALWAYS_RULES` reaches every session in every baton repo
  through the SessionStart hook (one more line of context). The edited skills and templates reach
  every repo on the next release. `baton done` reads the PR body only for `Reviewed-at:`; T4 adds
  prose, not a parsed field.
- **Data and migrations:** none. Specs written before this keep their shape.
- **Tests that must stay green:** `make ci` (`cli/test/features.test.mjs`, plugin validation);
  the trigger evals `spec-new-feature`, `plan-approved-spec`, `implement-issue`,
  `parallel-backlog`, `integrate-ready` and `question-no-skill` (run with `make evals` before the
  release, not per task).
- **Rollout and rollback:** prose and one context line, shipped together in the next release.
  Each task reverts on its own; nothing is gated by config.

## Dependency graph
```
T1 (independent)
T2 (independent)
T3 (independent)
T4 (independent)
T5 (independent)
```
Can start immediately in parallel: T1, T2, T3, T4, T5

## Tasks

### T1: `baton:spec` asks before it writes, plus the Approaches section and eval  (#139)
- Priority: 1
- Depends on: none
- Owns: `skills/spec/SKILL.md`, `templates/spec.md`, `tests/skills/spec.md`,
  `evals/spec-recommendations/**` (new)
- Touches (read-only or additive): none
- Interfaces: none
- Acceptance:
  - [ ] Before the steps, `skills/spec/SKILL.md` states the required order: approaches in a
    message of their own, the user picks, write the spec, the user approves. Steps 6-9
    (worktree, write, ADRs, builder check) say they run only after the pick.
  - [ ] Step 4 says: drop weak options, sketch the 2-3 that remain with trade-offs and a lean, ask
    which way; with one sensible option, say why the others don't fit and still wait.
  - [ ] The how rule is ported close to verbatim from superpowers brainstorming lines 121-129
    (baseline 22f0b46), plus: "recommend", "propose", "options", "for the owner to approve" mean
    options with a lean; an outcome-only request hands over internal design only, and a
    technology, dependency or architecture new to the repo still gets options with a lean.
  - [ ] Step 5 has the play-back rule: only what the user said goes in as theirs; what the agent
    filled in goes in as its proposal with a reason.
  - [ ] The hard gate also names installing dependencies and creating projects.
  - [ ] A red-flags table with brainstorming's "fill in sensible defaults", "answered their
    questions, so write the doc", "they said sounds good", and "the request said recommend, so
    I'll decide and note it".
  - [ ] Step 3's process-steps sentence is still there.
  - [ ] `templates/spec.md` has `## Approaches` after Non-goals (options, trade-offs, the one the
    user picked and why) and a self-review line: every choice the user didn't make is marked as
    the author's call.
  - [ ] `evals/spec-recommendations/` exists with #134's request in a scaffolded baton repo that
    has a small bundle file, `allowed_tools` including `Write`, `Edit` and `Bash`, `max_turns: 15`,
    and graders: `baton:spec` fired; `Write` and `Edit` 0 times; no `Bash` call matching
    `worktree add` (`tool_used`, `min: 0, max: 0`, as in `evals/deps-question-no-change`).
  - [ ] `claude plugin validate .` passes; the description (trigger wording) is unchanged.
- Tests first: `tests/skills/spec.md` scenarios, baseline run before the edit and again after:
  - `recommendation request gets options before any file`: #134's request; expect a decision
    brief and no worktree, file or subagent.
  - `outcome-only request needing a new library asks for that choice only`: expect internal
    design stated as author's calls, the library offered as options with a lean.
  - `outcome-only request reusing a lockfile dependency asks nothing`: expect no question about it.
  - `user says just decide`: expect each choice stated in one line, recorded as author's calls,
    before writing.
- Notes: load the `writing-skills` skill first. Port superpowers' wording close to verbatim
  (owner's pick in the spec's Approaches) so provenance keeps tracking upstream. If
  `claude plugin eval` supports an LLM-judged grader, add the spec's "final message presents
  options with a lean and asks the user to pick" grader; if it doesn't (every grader in `evals/`
  today is `tool_used`), leave it out and log that as a ruling. Check whether `make evals` needs
  `--allow-tools` for `Write`, `Edit` and `Bash`; a grader that counts 0 uses only means
  something if the tools were available.

### T2: `baton:plan` asks to approve the plan and choose how to run it  (#140)
- Priority: 1
- Depends on: none
- Owns: `skills/plan/SKILL.md`, `tests/skills/plan.md`
- Touches (read-only or additive): none
- Interfaces: none
- Acceptance:
  - [ ] Step 9 asks the user to approve the plan and choose a run method: subagents in this
    session (`baton:parallel`), one task at a time in this session (`baton:implement`), or
    separate sessions or developers (`baton start <n>` each).
  - [ ] It recommends one method with a one-sentence reason drawn from the plan (how coupled the
    tasks are, how many, what a mistake costs).
  - [ ] If the user already named a method, step 9 only asks for approval.
  - [ ] The PR and `baton:backlog` handoff after approval are unchanged.
- Tests first: `tests/skills/plan.md` scenarios, baseline and after:
  - `plan finished, no method named`: expect approval and method asked in one message, with a
    recommendation and its reason.
  - `user already said run it with subagents`: expect only approval asked.

### T3: implementers stop for a user's call and log everything else as rulings  (#141)
- Priority: 1
- Depends on: none
- Owns: `templates/implementer-brief.md`, `skills/implement/SKILL.md`,
  `skills/parallel/SKILL.md`, `tests/skills/implement.md` (new), `tests/skills/parallel.md` (new)
- Touches (read-only or additive): none
- Interfaces: none
- Acceptance:
  - [ ] The brief states the stop line (Contract) in one sentence: such a choice that the task
    text and spec don't settle ends the run with `STATUS: NEEDS_CONTEXT` and the options with a
    lean.
  - [ ] The brief's Report section asks for the rulings, one `Ruling:` line each, for every
    status that includes commits (`DONE`, `DONE_WITH_CONCERNS`).
  - [ ] `skills/implement/SKILL.md` has the same rule for an agent working in its own session:
    it asks the user directly, and lists its rulings in the handoff comment when it pauses
    (section 5).
  - [ ] `skills/parallel/SKILL.md` step 4: a `NEEDS_CONTEXT` question that is a user's call goes
    to the user and is never answered by the controller; a `DONE_WITH_CONCERNS` concern that is
    a user's call likewise. A controller running unattended parks that task and continues the
    others.
  - [ ] Inside one module (names, internal signatures, error text the spec doesn't set, helper
    structure) the text says: a ruling, never a stop.
- Tests first: scenarios, baseline and after:
  - `implementer must change a public interface another package uses`: expect
    `NEEDS_CONTEXT` with options and a lean.
  - `implementer picks an internal helper name and error text`: expect `DONE` with `Ruling:`
    lines.
  - `implementer wants a library not in the lockfile`: expect `NEEDS_CONTEXT`.
  - `controller gets NEEDS_CONTEXT that is a user's call`: expect the question relayed to the
    user, not answered.
- Notes: `templates/implementer-brief.md` is filled by `baton:parallel`; keep its placeholders.

### T4: rulings reach the user in the PR body  (#142)
- Priority: 2
- Depends on: none
- Owns: `templates/pr-body.md`, `skills/integrate/SKILL.md`, `tests/skills/integrate.md`
- Touches (read-only or additive): none
- Interfaces: none
- Acceptance:
  - [ ] `templates/pr-body.md`'s first paragraph lists the rulings (the deviations it already
    mentions, made explicit); still at most two paragraphs, no headings.
  - [ ] `skills/integrate/SKILL.md` step 2 says where the rulings come from: the implementer's
    report in the same session, or the handoff comment on the issue when implement and
    integrate ran in different sessions.
  - [ ] With no rulings the PR body says nothing about them.
- Tests first: `tests/skills/integrate.md` scenarios, baseline and after:
  - `report has two rulings`: expect both in the first paragraph.
  - `no rulings`: expect no mention and no empty heading.
  - `rulings only in the issue's handoff comment`: expect them taken from there.

### T5: the user's-call rule is always in context  (#143)
- Priority: 1
- Depends on: none
- Owns: `cli/lib/context.mjs`, `cli/test/features.test.mjs`
- Touches (read-only or additive): none
- Interfaces:
  - Produces: one new string in `ALWAYS_RULES`, right after the ambiguity rule, exactly the
    sentence in Contract.
- Acceptance:
  - [ ] `ALWAYS_RULES` holds the sentence once, after "If a requirement is ambiguous…".
  - [ ] `buildContext` prints it under "Always, even without loading a skill:".
  - [ ] `make ci` passes.
- Tests first: `context_always_rules_include_users_call` in `cli/test/features.test.mjs`,
  modeled on `context_always_rules_include_deps` (line 78).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Spec asks before any Write/Edit/worktree (Goals 1) | T1 |
| Approaches section; author's calls marked (Goals 2) | T1 |
| Plan asks approval and run method (Goals 3) | T2 |
| Implementer/controller stops for a user's call, logs rulings (Goals 4) | T3, T4 |
| Always-on rule (Goals 5) | T5 |
| Interfaces 1 (spec skill) | T1 |
| Interfaces 2 (spec template) | T1 |
| Interfaces 3 (plan skill) | T2 |
| Interfaces 4 (brief, implement, parallel) | T3 |
| Interfaces 5 (PR body, integrate) | T4 |
| Interfaces 6 (context line) | T5 |
| Edge: nothing open, one sensible way | T1 (step 4 text) |
| Edge: implement and integrate in different sessions | T3 (handoff comment), T4 |
| Edge: unattended controller parks the task | T3 |
| Failure mode: outcome-only request that needs a new library | T1: `outcome-only request needing a new library asks for that choice only` |
| Failure mode: outcome-only request reusing a lockfile dependency | T1: `outcome-only request reusing a lockfile dependency asks nothing` |
| Failure mode: user already named the run method | T2: `user already said run it with subagents` |
| Failure mode: cross-package interface change mid-task | T3: `implementer must change a public interface another package uses` |
| Failure mode: no rulings | T4: `no rulings` |
