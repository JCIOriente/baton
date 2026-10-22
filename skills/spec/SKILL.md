---
name: spec
description: Use before building any new feature, module or behavior change in a baton repo. Turns an idea into an approved, committed spec through one-question-at-a-time dialogue. No code is written in this phase.
argument-hint: "[topic]"
---

# Spec

Turn an idea into a spec the user approved. **Hard gate:** no implementation, scaffolding or
code until the spec is written, self-reviewed and approved.

"Too simple to need a spec" is how unexamined assumptions get built. The spec can be five
lines. It still gets written and approved.

## Steps

1. **Read context.** Check existing specs (configured `docs.specs` dir), related code and recent
   commits. Check whether the topic is already covered.
2. **Check the scope first.** If the request spans several independent subsystems, say so
   before asking detail questions. Propose a split into sub-projects, each with its own
   spec -> plan -> implementation cycle and a build order. Then spec only the first one.
3. **Ask clarifying questions one at a time.** Prefer multiple choice. Focus on purpose, users and
   roles, constraints, success criteria and what is explicitly out of scope.
4. **Propose 2-3 approaches** with trade-offs. Lead with your recommendation and why.
5. **Present the design in sections**, sized to their complexity. Get approval per section:
   - domain model and data (entities, ownership, lifecycle, invariants)
   - interfaces (API, UI flows, events)
   - authorization (who can do what; this feeds RBAC/permissions directly)
   - error handling and edge cases
   - testing strategy (what proves it works)
6. **Write the spec** from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md` to
   `<docs.specs>/YYYY-MM-DD-<topic>.md`.
7. **Self-review and fix inline:** look for placeholders ("TBD", "etc.", "handle errors
   appropriately"), sections that contradict each other, requirements with two readings
   (pick one and say which), and scope still too big for one plan.
8. **Commit the spec** and ask the user to review the file. Iterate until they approve.
9. **Hand off** to `baton:plan`.

## Design principles

- Units with one purpose, clear interfaces, testable in isolation. You should be able to say
  what each unit does, how it is used, and what it depends on.
- In existing code, follow existing patterns. Include targeted fixes only where the current
  structure blocks this work. No unrelated refactors.
- YAGNI. Cut anything that is not needed for the success criteria.
- Name what is out of scope. It saves a round of review later.
