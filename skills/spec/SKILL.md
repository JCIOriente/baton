---
name: spec
description: Use before building a new feature, module or behavior change in a baton repo, when an idea or request is still ambiguous, or when the user asks to "design", "spec" or "think through" something.
argument-hint: "[topic]"
---

# Spec

Turn an idea into a spec the user approved. **Hard gate:** no implementation, scaffolding or
code until the spec is written, self-reviewed and approved.

"Too simple to need a spec" is how unexamined assumptions get built. The spec can be five
lines. It still gets written and approved.

## Steps

1. **Read context.** Check existing specs (configured `docs.specs` dir), related code and recent
   commits. Check whether the topic is already covered. Claims about current behavior cite
   `path:line`. Anything you could not confirm goes under Open questions, not into the design
   as fact.
2. **Check the scope first.** If the request spans several independent subsystems, say so
   before asking detail questions. Propose a split into sub-projects, each with its own
   spec -> plan -> implementation cycle and a build order. Then spec only the first one.
3. **Ask clarifying questions one at a time.** Prefer multiple choice. Focus on purpose, users and
   roles, constraints, success criteria and what is explicitly out of scope. Before presenting
   a design, check that you know each of these. If not, it's the next question:
   - scope (which modules/files), acceptance criteria, error and edge cases
   - security: who may do what, what data is sensitive
   - testing expectations, performance/volume, UI and accessibility needs
   - data changes (schema, migrations), and existing patterns to follow
   - audience: which locales, time zones, currencies, tenants (organizations) it must serve
4. **Propose 2-3 approaches** with trade-offs. Lead with your recommendation and why.
5. **Present the design in sections**, sized to their complexity. Get approval per section:
   - domain model and data (entities, ownership, lifecycle, invariants)
   - interfaces (API, UI flows, events)
   - authorization (who can do what; this feeds RBAC/permissions directly)
   - tenancy and localization (whose data is visible to whom, and which locales/time zones it serves)
   - error handling and edge cases
   - testing strategy (what proves it works)
6. **Write the spec** from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` to
   `<docs.specs>/YYYY-MM-DD-<topic>.md`.
7. **Self-review and fix inline:** look for placeholders ("TBD", "etc.", "handle errors
   appropriately"), sections that contradict each other, requirements with two readings
   (pick one and say which), and scope still too big for one plan. Check the writing too:
   factual and brief, no promotional wording, concrete example first and the general rule
   second. The TL;DR and "change in a nutshell" must make sense to someone who reads nothing else.
8. **Record decisions and vocabulary:**
   - Every hard-to-reverse choice made along the way (framework, database, tenancy model, auth
     approach) gets an ADR from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` in `docs/adr/`.
     The spec links to it instead of re-arguing it.
   - Domain terms that needed explaining, or that have more than one meaning, go in
     `CONTEXT.md` at the repo root (template: `${CLAUDE_PLUGIN_ROOT}/templates/context.md`).
     Use those terms consistently in the spec, the code and the issues.
9. **Commit the spec** (with any ADRs and the glossary) and ask the user to review the file.
   Iterate until they approve.
10. **Hand off** to `baton:plan`.

## Design principles

- Units with one purpose, clear interfaces, testable in isolation. You should be able to say
  what each unit does, how it is used, and what it depends on.
- In existing code, follow existing patterns. Include targeted fixes only where the current
  structure blocks this work. No unrelated refactors.
- YAGNI. Cut anything that is not needed for the success criteria.
- Name what is out of scope. It saves a round of review later.
