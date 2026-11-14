---
type: llm
weight: 1
---

The final message lays out options for the decisions the request names (the build tool, the
type strategy and the migration order), gives the author's lean for each with a reason, and asks
the user to pick before anything is written. It fails if the message says a spec, ADR, glossary
or worktree was created, or presents the choices as already decided.
