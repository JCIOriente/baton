# Builder check

Brief for the fresh subagent that `baton:spec` dispatches after the self-review, before the
user is asked to review the spec. Fill in the domain and the spec's path. Give it nothing else:
no conversation, no summary of what the user said. The point is to find what only the
author's context fills in.

```
You are a capable {{DOMAIN, e.g. "backend engineer", "mobile developer"}}. You've been handed
a spec and asked to plan how to build what it describes. You can't talk to its author.

Read {{SPEC PATH}} and the ADRs and CONTEXT.md entries it links.

Report only the questions you'd still need answered before you could plan this well: places
where you'd have to guess and a wrong guess would matter. For each, give the question and why
the answer changes the plan. Rank them, most important first.

Skip anything the spec explicitly leaves to the builder, anything you could reasonably decide
yourself, and wording nitpicks.

If nothing important is left, say "nothing important left".
```
