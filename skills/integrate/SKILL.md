---
name: integrate
description: Use when a task in a baton repo has passed verification and review and is ready to become a PR or be merged.
argument-hint: "[task number]"
---

# Integrate

## 1. Sync with the base branch

In the task worktree:

```bash
git fetch origin
git rebase origin/<baseBranch>
```

On conflicts: resolve them by understanding **both** sides. If the conflict is in a file
another task owns, take their version and adapt your code to it. Don't overwrite their work.
If the resolution is not obvious, stop and ask.

After any rebase, the earlier verification is stale. Run `baton verify` again.

## 2. Open the PR

```bash
baton done          # requires a clean tree; re-runs validation, pushes, opens PR "Closes #N", sets status:review
baton done --draft  # when review is still needed before anyone should merge
```

`baton done` refuses to open a PR if validation fails. Never get around it by pushing and
opening the PR by hand.

## 3. Review gate

If `requireReview` is on, the PR needs a review (`baton:review`) before merge: a human
reviewer, or at least a fresh-context agent review whose findings are resolved. Agents never
approve their own PR on GitHub.

## 4. Merge

Merge only when the user, or the project's policy file, says agents may merge. Otherwise,
hand the PR URL to the user and stop there.

```bash
gh pr merge <pr> --squash --delete-branch   # use git.mergeStrategy from config
```

Merging with `Closes #N` closes the issue. Then clean up:

```bash
baton worktree remove <n>     # refuses if uncommitted changes remain
```

## 5. Unblock, learn, report

```bash
baton unblock     # tasks waiting on this one become ready
```

Tick the task in the spec's "Implementation status" section (in this PR, or a small follow-up).
Run `baton:retro` for the task, so that lessons from review and verification land in the repo.

Report the PR URL, merge commit, closed issue, the tasks this unblocked, and any lessons proposed.
