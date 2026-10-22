---
name: writing-skills
description: Use when creating or editing a baton skill, reviewer brief, stack guide or template in this repository, or when a skill is being ignored or misapplied by agents.
---

# Writing baton skills

Development-only skill for this repo. It is not shipped with the plugin.

A skill is a test-driven piece of process documentation. If you never watched an agent fail
without it, you don't know whether it teaches the right thing.

## Red, green, refactor for documentation

1. **Red: baseline without the change.** Write 2-3 pressure scenarios that a fresh subagent
   gets *without* the new or changed text. For example: "the task is urgent, just push it",
   "the test is flaky, retry until green", "this file belongs to another task but the fix is
   one line". Record what it does and, word for word, the rationalizations it uses.
2. **Green: write the minimum text** that addresses those specific failures. Re-run the same
   scenarios with the skill loaded. The agent must now comply.
3. **Refactor: close loopholes.** For each new rationalization, add an explicit counter
   ("Retrying until green hides the bug; quarantine with an issue instead"). Re-test.

Run the scenarios as subagents with only the skill text and the scenario, never your own
context. Keep the scenarios in `tests/skills/<skill>.md` so changes can be re-checked.

## Frontmatter

- `name`: short, matches the directory. Plugin skills are invoked as `/baton:<name>`.
- `description`: **triggering conditions only**, starting with "Use when...". Never summarize
  the workflow there. If the description says what the steps are, agents follow the
  description and skip the body. (superpowers observed a description reading "code review
  between tasks" cause one review instead of the two the body required.)
- `argument-hint` for skills that take an argument. `disable-model-invocation: true` for
  skills that only make sense when the user asks for them (e.g. `init`).

## Body

- Imperative, specific, checkable. "Run `baton verify`" beats "make sure things work".
- State the gate and its exit condition. Agents skip steps that have no visible end state.
- Put the CLI in charge of anything mechanical. Skills decide *when* and *why*, `baton` does *how*.
- Refer to other skills by name (`baton:verify`) instead of repeating their content.
- Use `${CLAUDE_PLUGIN_ROOT}` for paths to templates and guides inside the plugin.
- Token budget: the router (`workflow`) and frequently loaded skills stay short (< ~600
  words). Move details to templates, guides or `baton help`.
- No emojis, no shouting, no persona fluff. Bold only for the one rule per section that agents
  break most.

## Stack guides and reviewer briefs

- Guides: rules an agent applies while writing code. Reviewer briefs: checks with a
  concrete failure scenario. Don't put the same rule in both. The brief can point to the guide.
- No project-specific content. Use the target project only to judge what matters.
- Every adapted source is credited in `NOTICE`.

## Before committing

- `npm test` and `claude plugin validate .` pass.
- For a changed skill: the red/green scenarios were run, and the result is noted in the commit body.
