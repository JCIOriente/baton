---
tags: [behavior, spec]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Spec the migration of the design-system bundle to TSX components; settle the build tool, type strategy and migration order as recommendations for the owner to approve. Why: nobody can type-check the hand-written bundle, its .d.ts keeps drifting, and the apps that embed it break on releases.
