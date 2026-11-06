---
tags: [trigger, positive]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Upgrade tokio in the worker crate to the latest, the newer broadcast channel close semantics fix a bug we keep hitting.
