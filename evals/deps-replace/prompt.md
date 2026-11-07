---
tags: [trigger, positive]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Replace moment with dayjs in package.json, moment is huge and in maintenance mode. We only use it to format the event dates.
