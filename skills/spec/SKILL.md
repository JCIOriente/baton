---
name: spec
description: Use before building a new feature, module or behavior change in a baton repo, when an idea or request is still ambiguous, or when the user asks to "design", "spec" or "think through" something.
argument-hint: "[topic]"
---

# Spec

Turn an idea into a spec the user approved. **Hard gate:** no implementation, scaffolding,
installing dependencies, creating projects or code until the spec is written, self-reviewed,
builder-checked and approved.

"Too simple to need a spec" is how unexamined assumptions get built. The spec can be five
lines. It still gets written and approved.

## Order

Before you write anything, you must, in order:

1. Lay out the approaches in a message of their own, and have the user pick one (step 4).
2. Write the spec (steps 6-9).
3. Get their approval of that spec.

Steps 6-9 (worktree, write, ADRs, builder check) run only after the pick. No worktree, file or
subagent exists before the user has answered.

## How it gets made

Every project rests on choices about tools and resources: the platform, programming language
and libraries, how the code is split into modules. Read from how they talk which of those
choices they want to make. Someone who raises the how or asks about trade-offs wants the options
with your pick, and so does a request that says "recommend", "propose", "options" or "for the
owner to approve". Someone who talks about outcomes is handing you the internal design: make
those calls and state each in a line. That never hands over a technology, dependency or
architecture new to the repo: it is the **user's call** even when the request only describes
outcomes, so it gets 2-3 options with your lean, and you wait. So does a choice that crosses a
module or package boundary, adds a technology or dependency new to the repo, or contradicts or
extends what the spec says the user sees ("extends": a new screen, command, option, flow or
state the spec doesn't describe). When there's existing work, build on what it already uses:
something in its manifest or lockfile needs no question. When they say "just decide" or "your
call", that hands you their calls too: decide, send each choice in one line as the approaches
message, then write without waiting. Any choice you make goes in the spec as the **author's call**,
never as something they agreed to.

## Steps

1. **Read context.** Check existing specs (configured `docs.specs` dir), related code and recent
   commits. Claims about current behavior cite `path:line`. Anything you could not confirm goes
   under Open questions, not into the design as fact.
2. **Check the scope first.** If the request spans several independent subsystems, say so
   before asking detail questions. Propose a split into sub-projects, each with its own
   spec -> plan -> implementation cycle and a build order. Then spec only the first one.
3. **Ask only what changes the build** and the request or code doesn't settle, one per
   message. Never reopen their decisions. Unless they said why, ask that first: open, no
   options. Process steps (write-up, file paths, more reading) are yours: do them, say so; the
   write-up still waits for the pick (Order).
   Each gap below is the next question:
   - scope (which modules/files), acceptance criteria, error and edge cases
   - security: who may do what, what data is sensitive
   - testing expectations, performance/volume, UI and accessibility needs
   - data changes (schema, migrations), and existing patterns to follow
   - audience: which locales, time zones, currencies, tenants (organizations) it must serve
4. **Lay out the approaches** in a message of their own. Come up with several real
   alternatives and drop the weak ones, including any that work against why they want it and
   any the existing code rules out. Sketch the 2-3 that remain with what each trades off, your
   lean first and why, then ask which way they want to go. Only one sensible? Say so and why
   others don't fit, and still wait for their answer.
5. **Present the design section by section**, following
   `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` from Users & permissions through Testing strategy,
   each sized to its complexity. Design units with one purpose, clear interfaces, testable in
   isolation, following existing patterns. Only what they said goes in as theirs; anything you
   filled in goes in as your proposal, with your reason. Get approval per section.
6. **After the pick, write the spec in a worktree.** Run `baton worktree add <topic>` and work
   only inside the printed path, however small the spec: the main checkout is never edited or
   committed in. Write it from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` to
   `<docs.specs>/YYYY-MM-DD-<topic>.md`, with the user's pick under Approaches.
7. **Self-review** against the checklist comment at the end of the template, fix inline, then
   delete the comment.
8. **Record decisions and vocabulary** (after the pick):
   - A choice that later specs will have to follow (framework, database, tenancy model, auth
     approach) gets an ADR from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` in `docs/adr/`.
     The spec links to it instead of re-arguing it. Being hard to reverse is not enough: if
     only this spec depends on the choice, its reasoning goes in the spec's FAQ, not an ADR.
   - Domain terms that needed explaining or have more than one meaning go in `CONTEXT.md` at
     the repo root (template: `${CLAUDE_PLUGIN_ROOT}/templates/context.md`); use them
     consistently in the spec, the code and the issues.
9. **Builder check, then commit** (after the pick). Your context fills gaps a builder can't
   see: dispatch a fresh subagent with `${CLAUDE_PLUGIN_ROOT}/templates/builder-check.md` and
   only the spec's path. Sort its questions as the template says; the user's calls go in one
   message. **A default you picked is the author's call, never something the user agreed to.**
   Commit the spec, ADRs and glossary in that worktree and ask the user to review the file and
   your calls. Iterate there until they approve, then push the branch and open the PR with
   `gh pr create`.
10. **Hand off** to `baton:plan`.

## Red flags

| Thought | Reality |
|---|---|
| "I'll fill in sensible defaults" | Good. Say them out loud. A default they never heard is one they couldn't reject. |
| "I've answered their questions, so I'll write the doc" | Lay out the approaches first, in a message of their own. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A spec you haven't written isn't approved. |
| "The request said recommend, so I'll decide and note it" | "Recommend" asks for options with your lean. Send them and wait for the pick. |
