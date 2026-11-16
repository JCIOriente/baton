---
name: handoff
description: Use when the user asks for a prompt to continue in another session or a fresh session, or to hand off or end this session, or when baton:retro or baton:parallel sends you here at a unit boundary, in a baton repo.
argument-hint: "[spec path]"
---

# Session handoff

The session handoff starts the next session. `baton handoff` prints its facts
from GitHub and git; you fill its `<FILL: …>` slots. The next session reads only this prompt,
the issues and the committed docs, never this chat.

## 1. Bring the record up to date

Put this session's decisions and rulings on their issues and tick the spec's Implementation
status. Changes to committed files go through a worktree and PR; tell the user what is
still stale. Update any session memory you keep.

## 2. Pick the next session's spec

1. The argument, if given.
2. Else, mid-unit: the unit this session is working on.
3. When that unit lists no open tasks (`- no open tasks` under it, or `No open tasks.`), ask the
   user which spec is next and wait. If none is chosen, run without `--spec`.

## 3. Draft and fill

Run `baton handoff --spec <spec>` (or `baton handoff`). Replace every `<FILL: …>` slot; keep every
other line:

- Goal, Stop at, Next steps: from the issues, the spec and this session's decisions.
- Leave alone: from the printed candidates. Candidates are not decisions: check each against the
  issues and this session's decisions, and drop any the next session must act on.

## 4. Give the prompt

Give it inline in one block fenced with four backticks. Exit condition: the block contains no
`<FILL` and no `{{`.

## Rules

- **Never give a prompt that contains `<FILL`.** If the record can't decide a slot, ask the user.
- Without `gh` access (`baton handoff` exits 1, "Could not read tasks and PRs from GitHub"): fill
  `${CLAUDE_PLUGIN_ROOT}/templates/handoff.md` by hand. `{{project}}` is the project name;
  `{{facts}}` becomes "Where things stand" lines from `baton status`, git and the issues as last
  read. Fill each slot as in step 3 and give the whole prompt as in step 4. Say, in your reply and
  in the prompt, that the facts were not read from GitHub.
- The prompt holds absolute local paths and is for the user's own next session only; never post
  it to an issue or PR.
