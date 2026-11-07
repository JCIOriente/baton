---
name: spec
description: Use before building a new feature, module or behavior change in a baton repo, when an idea or request is still ambiguous, or when the user asks to "design", "spec" or "think through" something.
argument-hint: "[topic]"
---

# Spec

Turn an idea into a spec the user approved. **Hard gate:** no implementation, scaffolding or
code until the spec is written, self-reviewed, builder-checked and approved.

"Too simple to need a spec" is how unexamined assumptions get built. The spec can be five
lines. It still gets written and approved.

## Steps

1. **Read context.** Check existing specs (configured `docs.specs` dir), related code and recent
   commits. Claims about current behavior cite `path:line`. Anything you could not confirm goes
   under Open questions, not into the design as fact.
2. **Check the scope first.** If the request spans several independent subsystems, say so
   before asking detail questions. Propose a split into sub-projects, each with its own
   spec -> plan -> implementation cycle and a build order. Then spec only the first one.
3. **Ask only what changes the build** and the request or code doesn't settle, one per
   message. Never reopen their decisions. Unless they said why, ask that first: open, no
   options. Process steps (write-up, file paths, more reading) are yours: do them, say so.
   Each gap below is the next question:
   - scope (which modules/files), acceptance criteria, error and edge cases
   - security: who may do what, what data is sensitive
   - testing expectations, performance/volume, UI and accessibility needs
   - data changes (schema, migrations), and existing patterns to follow
   - audience: which locales, time zones, currencies, tenants (organizations) it must serve
4. **Propose 2-3 approaches** with trade-offs, your pick first and why. Only one sensible?
   Say so and why others don't fit.
5. **Present the design section by section**, following
   `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` from Users & permissions through Testing strategy,
   each sized to its complexity. Design units with one purpose, clear interfaces, testable in
   isolation, following existing patterns. Get approval per section.
6. **Write the spec in a worktree.** Run `baton worktree add <topic>` and work only inside
   the printed path, however small the spec: the main checkout is never edited or committed in.
   Write it from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` to `<docs.specs>/YYYY-MM-DD-<topic>.md`.
7. **Self-review** against the checklist comment at the end of the template, fix inline, then
   delete the comment.
8. **Record decisions and vocabulary:**
   - A choice that later specs will have to follow (framework, database, tenancy model, auth
     approach) gets an ADR from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` in `docs/adr/`.
     The spec links to it instead of re-arguing it. Being hard to reverse is not enough: if
     only this spec depends on the choice, its reasoning goes in the spec's FAQ, not an ADR.
   - Domain terms that needed explaining or have more than one meaning go in `CONTEXT.md` at
     the repo root (template: `${CLAUDE_PLUGIN_ROOT}/templates/context.md`); use them
     consistently in the spec, the code and the issues.
9. **Builder check, then commit.** Your context fills gaps a builder can't see: dispatch a
   fresh subagent with `${CLAUDE_PLUGIN_ROOT}/templates/builder-check.md` and only the spec's
   path. Sort its questions as the template says; the user's calls go in one message.
   **A default you picked is the author's call, never something the user agreed to.**
   Commit the spec, ADRs and glossary in that worktree and ask the user to review the file and
   your calls. Iterate there until they approve, then push the branch and open the PR with
   `gh pr create`.
10. **Hand off** to `baton:plan`.
