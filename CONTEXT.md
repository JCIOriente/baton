# Domain context

Shared vocabulary for people and agents working on baton. Use these terms exactly, in code,
specs and issues. When a term is ambiguous or keeps needing explanation, add it here.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Task | An issue matching `tasks.kind` (type `Task`, or the `task` label): one unit of planned work, claimable by one holder | Any issue. A bug report is not a task until someone makes it one |
| Triage | An open issue that is not a task | The old `status:triage`, which no longer exists |
| Status | `ready`, `blocked`, `in-progress`, `review` or `done`, computed from GitHub data on every read, never stored | A label |
| Blocker | An issue linked with GitHub's "blocked by" relation. A task with an open blocker is `blocked` | A `Depends on:` line, which is no longer read |
| Plan issue | The parent issue of the tasks created from one plan. Links the spec and plan docs. Not claimable | The plan doc in `docs/plans/` |
| Claim | The marker comment that wins the race for a task. The assignee is set only after a claim wins | Assigning someone by hand |
| Release | In repos with `release.enabled`: a version with its tag (`v<version>`, no package name), GitHub Release, generated `CHANGELOG.md` section and, when `release.publish` is set, the same version on each registry. Created only by merging the release PR | A merged task PR, or releasing a claim (`baton release <n>`) |
| Release PR | The one open PR that release-please maintains (label `autorelease: pending`), holding the next version and its notes | A task PR |
| Publish environment | The `publish` GitHub environment, with required reviewers, that the single `publish` job runs in. Approving its deployment is the one human approval that publishes a release to every registry | The `release` environment, which only holds the release-please token |
| Dry run | A `release.yml` run dispatched with `dry_run: true`: builds and checks every package and runs each registry's dry-run publish, with no credentials, approval, tag or Release | A normal `workflow_dispatch` run, which refreshes the release PR |
| Accepted advisory | A security advisory ID in the project's committed ignore list (`deny.toml`, `.cargo/audit.toml`, the package manager's config), with a reason it isn't reachable and a condition for dropping it. The only kind of advisory an audit may skip | An `--ignore` flag on a command line, or a lowered audit threshold |
| Main checkout | The working tree whose git dir is the repository's common dir (`git rev-parse --git-dir` equals `--git-common-dir`). Parked on the base branch, only fast-forwarded, never edited or committed in when `hooks.worktreeOnly` is on | The base branch itself, or "the repo" |
| User's call | A choice of technology (library, tool, framework) or dependency new to the repo, architecture (structure across modules or packages, a public interface or data shape between them) or user-visible behavior, even when the request only describes outcomes. Only the user decides it; an agent presents 2-3 options with its lean and waits. Building on what the repo already uses is not one | An author's call |
| Author's call | A choice an agent made that is not a user's call, including the internal design an outcome-only request hands over. Stated out loud and marked as the agent's, never as agreed | A decision the user made |
| Ruling | An author's call made during implementation, inside one module (a name, an internal signature, error text the spec doesn't set), recorded as `Ruling: <what> — <why> — <cost if wrong>` in the implementer's report and the PR body. A choice that crosses a module or package boundary, or contradicts or extends what the spec says the user sees, is a user's call instead | A review finding |
| Linked worktree | Any other working tree of the repository (`git worktree add`), from `baton start <n>` for a task or `baton worktree add <name>` for other changes. Where every change is made | A clone, or a task (a worktree need not belong to one) |
| Unit | The piece of work one controller session owns from start to end: one spec (each sub-project of a split spec has its own). It closes when `baton handoff --spec <spec>` shows no open tasks in its group and its retro is done | A task (a unit usually holds several) |
| Gate | A name from baton's fixed gate catalog (`secrets`, `format`, `lint`, `unit-tests`, ...) for one kind of check. Covered by the `validate` steps that list it, or skipped with a reason in `gates.skip` | A workflow gate (spec before plan, review before merge), or a step |
| Gate catalog | The fixed, ordered list of gate names in `cli/lib/gates.mjs`. Static gates come first | A repo's `validate` list |
| Step | One entry in `validate`: a command, the gates it covers, the stages it runs in, and whether it blocks | A gate (one step can cover several) |
| Stage | When a step runs: `commit` (pre-commit hook), `local` (`baton verify`, `start`, `done`) or `ci` (`baton verify --stage ci`) | A workflow phase |
| Advisory step | A step with `"blocking": false` and a `reason`: its failure is reported but doesn't stop the run or fail it | A skipped gate, which doesn't run at all |
| Skipped gate | An applicable gate listed in `gates.skip` with its reason, so `baton doctor` doesn't report it as a gap | An advisory step |
| Narrowed run | `baton verify --only <step or gate>`: part of a stage, never reported as a gate run | A stage run |
| Session handoff | The self-contained prompt that starts the next session. Its facts come from `baton handoff`; its goal, stopping point, next steps and leave-alone list are filled by the agent. It never depends on chat history | A phase hand-off, or a task's handoff comment on its issue |
| Size limit | `structure.maxLines` (500 by default): the most lines a counted file may have. Enforced by `baton structure`, the `structure` gate's built-in guard | Function size, which stays a review prompt |
| Counted file | A file `baton structure` measures: a regular file in the working tree, tracked or untracked but not ignored by git, with a source extension baton has a guide for, and not matched by `structure.exclude`. Tests count | Any file in the repo; docs, config and generated code aren't counted |
| Allowlist | `structure.allowlist`: the files allowed to stay over the size limit, each with its exact line count. It only shrinks: a listed file must match its entry, and baton prints the edit but never writes it | `baton start`'s baseline (the validation run before any change), or a skipped gate |

## Relationships
A spec has one plan doc. A plan doc becomes one plan issue with tasks as its sub-issues. A task has
zero or more blockers, at most one holder (the assignee after a winning claim), and is done when a PR
that closes it merges.
