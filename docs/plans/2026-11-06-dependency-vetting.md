# Dependency vetting — Implementation Plan

- Spec: [docs/specs/2026-11-06-dependency-vetting.md](../specs/2026-11-06-dependency-vetting.md)
- Date: 2026-11-06
- Status: draft

## Overview
Three tasks, cut by file ownership. T1 and T2 can run in parallel. T3 adds the pointers that
send agents to `baton:deps`, so it starts after T1 merges: a context line naming a skill that
doesn't exist yet would send every session looking for it.

- T1: the `baton:deps` skill, its red/green scenarios and its trigger evals
- T2: the repo-level rules in the stack guides and the reviewer pointer
- T3: the always-on context line and the pointers from the workflow and implement skills and the
  README

The spec's `CONTEXT.md` entry (**Accepted advisory**) was committed with the spec, so no task
owns `CONTEXT.md`. Cut the next release only after all three tasks merge: T2's guide line names
`baton:deps`, which ships with T1.

## Contract
- Skill name and invocation: `deps`, invoked as `baton:deps`, at `skills/deps/SKILL.md` (T1).
  T2 and T3 refer to it by that name.
- The always-on line, owned by T3, exactly as in the spec: "Before adding, upgrading or
  replacing a dependency, load baton:deps. Never take a version from memory."
- The report heading `## baton:deps: <package>` (T1). T2's reviewer pointer refers to "a
  `baton:deps` report in the PR or commit".

## Impact
- **Affected call paths and consumers:** `ALWAYS_RULES` in `cli/lib/context.mjs` reaches every
  session in every baton repo through the SessionStart hook, so T3's line costs every session a
  little context. `stacks/common.md` loads in every repo (baseline guide), so T2's rules reach
  every project, including repos with no JS or Rust; the rules must read as conditional on the
  ecosystem ("for JS…", "for Rust…").
- **Data and migrations:** none. Repos that pass `--ignore` flags in scripts move them into the
  committed list when they adopt the guide rule; baton migrates nothing.
- **Tests that must stay green:** `cli/test/features.test.mjs` (context, `ALWAYS_RULES`), the
  plugin validation (`claude plugin validate .`), and the existing trigger evals, in particular
  `evals/question-no-skill` (it must still fire no skill).
- **Rollout and rollback:** prose and one context line. To roll back, revert T3 first (the
  pointer), then T1 and T2. Nothing is gated by config.

## Dependency graph
```
T1 ──> T3
T2 (independent)
```
Can start immediately in parallel: T1, T2

## Tasks

### T1: the `baton:deps` skill, scenarios and trigger evals  (#issue once created)
- Priority: 1
- Depends on: none
- Owns: `skills/deps/SKILL.md` (new), `tests/skills/deps.md` (new), `evals/deps-add/**` (new),
  `evals/deps-upgrade/**` (new), `evals/deps-lockfile-refresh/**` (new),
  `evals/question-no-skill/graders/*.md` (add `deps` to the skill list),
  `provenance.json` (facts for version-dependent manager behavior only)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `skills/deps/SKILL.md` has the spec's frontmatter: `name: deps`, the "Use when adding,
    upgrading or replacing a dependency…" description (triggering conditions only), and
    `argument-hint: "<package>[@version]"`.
  - [ ] The body follows the spec's seven steps (identify, look up, peer compatibility, vet in a
    throwaway copy, decide, apply, report), the per-manager command table for npm, pnpm, yarn
    berry, yarn classic and cargo, the block rules, and the report format, in under ~600 words
    (`wc -w`).
  - [ ] Manager detection is by the nearest lockfile walking up from the manifest, with the
    spec's stops: bun, two lockfiles in one directory, no lockfile. No path is hardcoded.
  - [ ] The vet runs in `V=$(mktemp -d); git archive HEAD | tar -x -C "$V"`, copies in
    uncommitted manifest, lockfile and manager config, runs the baseline audit first, chains the
    lockfile-only add and the audit, and removes `$V`. A blocked candidate leaves the
    worktree's manifest and lockfile byte-identical (`git diff --exit-code` on both).
  - [ ] yarn classic blocks when `exit & 24` is non-zero; cargo uses `cargo deny check
    advisories` when `deny.toml` exists, else `cargo audit`; the crates.io web API is never
    called (yanked status from the sparse index).
  - [ ] The skill never adds an accepted advisory, lowers a threshold or passes
    `--ignore`/`--force` without the user's explicit OK, and says so as a rule.
  - [ ] The spec's four Open questions are answered by running the commands (pnpm 11 ignore-list
    key and location, yarn 4 `npmAuditIgnoreAdvisories`, workspace member flags against a real
    workspace with the lockfile staying at the root, install-script detection per manager). Each
    answer is in the skill or, if unresolved, the report says "not checked" for that manager.
    The answers are listed in the PR description.
  - [ ] `tests/skills/deps.md` records the five spec scenarios with the baseline behavior
    without the skill (verbatim rationalizations) and the result with it, run as fresh
    subagents with only the skill text and the scenario, in the format of
    `tests/skills/init.md`. All five comply with the skill loaded.
  - [ ] `evals/deps-add` and `evals/deps-upgrade` are positive trigger cases and
    `evals/deps-lockfile-refresh` a negative one, modelled on `evals/integrate-ready/` and
    `evals/question-no-skill/`, with prompts seeded from orientate's trigger queries.
    `evals/question-no-skill` lists `deps` among the skills that must not fire.
  - [ ] `claude plugin validate .` and `make ci` pass.
- Tests first: the five red scenarios in `tests/skills/deps.md`, run without the skill.
- Notes: follow `.claude/skills/writing-skills/SKILL.md`. Look up every version during the
  task; don't reuse the spec's 2026-11-06 numbers without checking them again. Version-dependent
  behavior the skill relies on (npm's single-field `npm view` output, pnpm's undocumented
  `--lockfile-only` on `add`, yarn classic's exit bitmask) gets a `facts` entry in
  `provenance.json` if `baton upstream` handles facts in skill files (`cli/lib/provenance.mjs`);
  otherwise note it in the PR. Never send personal data (an email in a `User-Agent`) to a
  registry. Don't edit `CHANGELOG.md`.

### T2: repo-level rules in the stack guides and the reviewer pointer  (#issue once created)
- Priority: 2
- Depends on: none
- Owns: `stacks/common.md` (§ Dependencies), `stacks/rust.md` (§ Dependencies),
  `stacks/node.md` (line 48 only), `reviewers/security.md` (item 13 only)
- Touches (read-only or additive): none
- Acceptance:
  - [ ] `stacks/common.md` § Dependencies has each spec rule once: dependency changes go through
    `baton:deps` and never use a version from memory; one package manager and one committed
    lockfile per project directory, a second manager's lockfile removed; frozen installs in CI
    and worktree `setup` (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install
    --immutable` / classic `--frozen-lockfile`, `cargo build/test --locked`); an audit command
    in `validate`; ignored advisories only in the ecosystem's committed list with a reason and
    a drop condition, never as a command-line flag; CI tools pinned to a version; unused
    dependencies detected (knip, cargo-machete) and removed. The existing three lines stay.
  - [ ] `stacks/rust.md` § Dependencies names cargo-deny as the main gate: `deny.toml` with
    `unknown-registry = "deny"`, `unknown-git = "deny"`, crates.io only, an explicit license
    allowlist, and `cargo deny check` in `validate`. The minimal-features line stays.
  - [ ] `stacks/node.md:48` is replaced by a one-line pointer to the common guide's
    Dependencies section.
  - [ ] `reviewers/security.md` item 13 gains "A new or upgraded dependency comes with a
    `baton:deps` report in the PR or commit." The rest of the item stays.
  - [ ] No rule appears in both a guide and the reviewer brief (`grep` each rule's key phrase
    across `stacks/` and `reviewers/`).
  - [ ] `make ci` passes.
- Tests first: none (prose). The reviewer checks each rule against the spec's Stack guide
  changes section and the one-place rule.
- Notes: keep the rules ecosystem-conditional, since `common.md` loads in every repo. Use
  orientate's `deny.toml` as the example shape, without its project-specific ignores. If a
  statement depends on a manager version, add a `facts` entry in a follow-up rather than
  touching `provenance.json` here (T1 owns it). Don't edit `CHANGELOG.md`.

### T3: context line and skill pointers  (#issue once created)
- Priority: 1
- Depends on: T1
- Owns: `cli/test/features.test.mjs` (the context test only)
- Touches (read-only or additive): `cli/lib/context.mjs` (one `ALWAYS_RULES` entry),
  `skills/workflow/SKILL.md` (one supporting-skill entry), `skills/implement/SKILL.md` (one
  sentence in § 4), `README.md` (one line in the command list)
- Acceptance:
  - [ ] `ALWAYS_RULES` has the Contract's line, and the SessionStart context of a configured
    repo shows it under "Always, even without loading a skill".
  - [ ] The context test asserts that one `ALWAYS_RULES` entry mentions `baton:deps`.
  - [ ] `skills/workflow/SKILL.md`'s supporting skills list `baton:deps` (adding, upgrading or
    replacing a dependency).
  - [ ] `skills/implement/SKILL.md` § 4 Stay in bounds says "Adding or upgrading a dependency:
    `baton:deps` first."
  - [ ] `README.md`'s command list has `/baton:deps <package>` with a short comment, in the
    style of the other lines.
  - [ ] Each edit is one line or one sentence; nothing else in those files changes.
  - [ ] `npm test` and `make ci` pass.
- Tests first: `context_always_rules_include_deps` in `cli/test/features.test.mjs`.
- Notes: these four files are also changed by the worktree-only plan (see Cross-plan overlap).
  Rebase on `main` right before opening the PR and keep the edits additive so either order
  merges cleanly. Don't edit `CHANGELOG.md`.

## Cross-plan overlap
The worktree-only plan (`docs/plans/2026-11-06-worktree-only.md`, ships as `feat!`) changes
some of the same files. This plan's edits there are additive and one line each, so backlog can
run them in either order; whichever merges second rebases.

| File | This plan's edit | Task |
|---|---|---|
| `cli/lib/context.mjs` | Append one `ALWAYS_RULES` entry (the Contract line). The worktree-only plan rewords the first entry; don't touch it. | T3 |
| `cli/test/features.test.mjs` | One assertion in the context test. Likely touched by the worktree-only plan's context and hook tests. | T3 |
| `skills/workflow/SKILL.md` | Add `baton:deps` to the supporting-skills sentence (line 49-50). | T3 |
| `skills/implement/SKILL.md` | One sentence in § 4 Stay in bounds. | T3 |
| `README.md` | One line in the `/baton:` command list (lines 29-39). | T3 |
| `CONTEXT.md` | Already changed in the spec commit (one row, **Accepted advisory**). The worktree-only spec adds two rows on its own branch; the spec PRs may conflict on adjacent rows, resolved by keeping all three. | spec PR |

Not touched by this plan: `hooks/hooks.json`, `cli/lib/config.mjs`, and the spec, plan,
backlog, retro, init and integrate skills.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| `baton:deps` skill, triggering-only description, `argument-hint` | T1 |
| Live registry lookup; never a version from memory; explicit versions vetted too | T1 (skill), T2 (common guide rule), T3 (context line) |
| Deprecated / yanked / failed resolve / new advisory blocks | T1 |
| npm, pnpm, yarn berry and classic, cargo; manager from the nearest lockfile; bun, two lockfiles, no lockfile stop | T1 |
| Throwaway `git archive` copy with uncommitted files, baseline then chained add and audit | T1 |
| Blocked candidate leaves manifest and lockfile unchanged | T1 |
| yarn classic exit bitmask; cargo-deny before cargo-audit; sparse index, no crates.io API | T1 |
| Accepted advisories only in committed lists, only with the user's OK | T1 (skill rule), T2 (guide rule) |
| Install scripts listed, not blocked | T1 |
| Edge cases: baseline failing, workspace member, replace, major upgrade, offline, private registry | T1 |
| Open questions (pnpm, yarn berry ignore lists, workspace flags, install scripts) | T1 |
| Stack guide rules in `common.md`; cargo-deny in `rust.md`; pointer in `node.md` | T2 |
| `reviewers/security.md` item 13 pointer | T2 |
| Each rule in exactly one guide, reviewer points to the skill | T2 |
| `ALWAYS_RULES` line; workflow and implement pointers | T3 |
| Red/green scenarios in `tests/skills/deps.md` | T1 |
| Trigger evals `deps-add`, `deps-upgrade`, `deps-lockfile-refresh` | T1 |
| `npm test` asserts the deps line in the context | T3 |
| `claude plugin validate .` passes | T1, T3 |
| `CONTEXT.md` **Accepted advisory** | spec commit |
| No NOTICE or `provenance.json` source entry for orientate | n/a (nothing to do) |
