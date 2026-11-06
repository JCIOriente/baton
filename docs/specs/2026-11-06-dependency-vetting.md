# Dependency vetting — Spec

- Status: approved
- Date: 2026-11-06
- Owner: Arnold Gandarillas
- Related: `reviewers/security.md` item 13, `stacks/common.md` § Dependencies

## TL;DR
- A new skill, `baton:deps`, runs before an agent adds, upgrades or replaces a dependency in a
  `package.json` or `Cargo.toml`. It looks the version up in the live registry, never from memory.
  It vets the candidate in a throwaway copy of the repo and blocks a deprecated package, a yanked
  version, a failed resolve or a new advisory.
- It supports npm, pnpm, yarn (classic and berry) and cargo, detected from the lockfile next to the
  manifest. Paths are never hardcoded. Bun is detected but not supported: the skill stops and says so.
- Accepted advisories live in one committed list per ecosystem that every audit run reads
  (`deny.toml` or `.cargo/audit.toml`; the pnpm and yarn berry locations are open questions).
  They never live in a command line, and the skill never adds an entry without the user's OK.
- The stack guides gain the repo-level rules: one lockfile, frozen installs, audit in `validate`,
  cargo-deny for sources and licenses, a reason and a drop condition on every ignored advisory,
  unused-dependency detection, and pinned tool installs.
- An always-on context line points agents at `baton:deps`, so the gate doesn't depend on the
  skill's description triggering.

## Change in a nutshell
An agent in a pnpm repo is asked to "add lodash for debounce". Today it writes
`"lodash": "^4.17.15"` from memory, which has three high advisories. With this spec it runs:

```text
$ npm view lodash dist-tags                     -> latest: 4.18.1
$ npm view lodash@4.18.1 deprecated             -> (empty: not deprecated)
$ V=$(mktemp -d); git archive HEAD | tar -x -C "$V"
$ (cd "$V" && pnpm audit --audit-level=high)    -> baseline: clean
$ (cd "$V" && pnpm add lodash@4.18.1 --lockfile-only --ignore-scripts \
           && pnpm audit --audit-level=high)    -> exit 0
$ rm -rf "$V"; pnpm add lodash@4.18.1            # now in the task worktree
```

and reports:

```text
## baton:deps: lodash
- Manager: pnpm (pnpm-lock.yaml at repo root)
- Version chosen: 4.18.1, latest stable (dist-tag latest, checked 2026-11-06)
- Deprecated: no   Yanked: n/a   Peer compat: ok
- Audit: clean (baseline clean)
- Install scripts in new packages: none
Action: added to apps/web/package.json
```

If the agent had picked 4.17.15, the copy's audit would have exited 1 and nothing in the repo
would have changed.

## Problem
Agents pick versions from training data, which is months or years old. They add packages that
have since been deprecated, versions that have since been yanked, or versions with published
advisories. `reviewers/security.md` item 13 catches some of this, but only after the code is
written, and only when the reviewer checks the registry. The guides say "audit in CI" and
"commit lock files" (`stacks/node.md:48`, `stacks/common.md:88`, `stacks/rust.md:91`), but they
say nothing about how to add a dependency safely. They also don't say where accepted advisories
live, or how to keep local runs, CI and the agent reading the same list.

orientate (the user's own project) solved this with a project skill, `secure-dep-vetting`, and
repo-level checks. That skill hardcodes `frontend/`, `backend/`, npm and its own make targets, so
other repos can't use it. orientate also shows two failures the guide rules below prevent:
- CI ran a bare `cargo audit` while the Makefile passed three `--ignore` flags, so local and CI
  verdicts could differ.
- CI ran `cargo install cargo-audit` without a version, so the tool could change between runs.

## Goals / Success criteria
- In the red/green scenarios (`tests/skills/deps.md`), an agent with the skill loaded never
  writes a version it didn't read from the registry in that session, and blocks every scenario
  whose candidate is deprecated, yanked or has a new high or critical advisory.
- Nothing in the repo changes while a candidate is being vetted, and a blocked candidate leaves
  the manifest and lockfile byte-identical.
- Each supported manager has exact lookup, vet and audit commands, verified against a real
  install of that manager.
- The trigger evals (`evals/deps-*`) pass: the skill loads for add, upgrade and replace prompts
  and doesn't load for a lockfile refresh or a dependency question with no change.
- Each repo-level rule appears in exactly one stack guide, and `reviewers/security.md` points to
  the skill instead of repeating it.

## Non-goals
- GitHub Actions versions, Docker base images, toolchain files: other mechanisms cover them (the
  drift check, image scanners).
- `baton init` or `baton doctor` checks for a missing audit step or a second lockfile. A possible
  follow-up.
- A `baton deps check <pkg>` CLI command that runs the mechanical steps. A possible follow-up,
  once the skill's steps have settled.
- Bun, Deno, Go, Python and other ecosystems.
- Transitive-only updates (`npm update`, `cargo update -p`) and frozen installs: they don't
  choose a new direct dependency.
- License vetting beyond what `cargo deny check licenses` does in `validate`.

## Users & permissions
| Role | Can | Cannot |
|---|---|---|
| Agent | Look up versions; vet in a throwaway copy; add or upgrade a vetted dependency inside its task worktree; report pre-existing advisories | Write a version it didn't look up in this session; add an entry to an accepted-advisory list, lower an audit threshold, or pass `--ignore`/`--force` to get a candidate through, all without the user's explicit OK |
| User | Accept an advisory, with a reason and a drop condition; pick between candidates; override a block | — |

## Tenancy & localization
n/a.

## Domain model
- **Manager:** the package manager that owns a manifest. For JS it is chosen from the nearest
  lockfile walking up from the manifest: `package-lock.json` → npm, `pnpm-lock.yaml` → pnpm,
  `yarn.lock` → yarn. Berry (2+) and classic (1.x) are told apart by `.yarnrc.yml` or
  `packageManager: "yarn@2+"`. `bun.lock`/`bun.lockb` → unsupported, stop. More than one
  lockfile in that directory → stop and report (see the guide rule). No lockfile → stop and ask,
  since a vet needs a lockfile to audit. For cargo: `Cargo.lock` at the workspace root
  (`cargo locate-project --workspace`).
- **Candidate:** package name, version, target manifest and the reason it is needed.
- **Accepted advisory:** an advisory ID in the project's committed ignore list, with a reason and a
  drop condition next to it. Only these may be ignored. Added to `CONTEXT.md`.
- **Baseline:** the audit result on the unmodified copy. Advisories found there already exist and
  are reported separately, never charged to the candidate.

## Interfaces

### Skill `skills/deps/SKILL.md`
Frontmatter:
```yaml
name: deps
description: Use when adding, upgrading or replacing a dependency in package.json or Cargo.toml, when choosing which version or which package to use, or when asked whether a dependency is safe, in a baton repo.
argument-hint: "<package>[@version]"
```

Steps (the skill body, under ~600 words; per-manager commands in a table):

1. **Identify:** ecosystem, package, target manifest, reason. If the user named a category
   ("a date library"), ask which one. Don't pick silently. Find the manager (Domain model).
2. **Look up** the latest stable version, deprecation and peer dependencies:
   - JS: `npm view <pkg> dist-tags`, then `npm view <pkg>@<v> deprecated` and
     `npm view <pkg>@<v> peerDependencies`, one field per call (empty output means unset).
     Several fields in one call, or `--json`, are ambiguous: npm 12 prints a bare value when only
     one field is set, and `--json` returns a list that omits unset fields. In a berry repo with a
     registry set only in `.yarnrc.yml`: `yarn npm info <pkg> --fields dist-tags,deprecated,peerDependencies --json`.
     Use the `latest` dist-tag, not the newest pre-release. A non-empty `deprecated` stops the
     vet: report the message, which often names the successor.
   - cargo: `cargo info <crate>` for the latest version and license. Yanked status comes from
     the sparse index: `curl -s https://index.crates.io/<prefix>/<crate>` (one JSON line per
     version with `"yanked"`). The crates.io web API refuses requests without an identifying
     User-Agent (403), so the skill doesn't use it.
   - A version the user named explicitly is vetted the same way. It doesn't skip the lookup.
3. **Peer compatibility (JS):** compare `peerDependencies` with the versions in the manifest. If
   they conflict, prefer the newest version that fits, and say so.
4. **Vet in a throwaway copy:** `V=$(mktemp -d); git archive HEAD | tar -x -C "$V"`, then copy
   in any uncommitted manifest, lockfile or manager config. Run the baseline audit, then the
   lockfile-only add and the audit, chained, so an audit never runs after a failed add. Remove
   `$V` afterwards.
5. **Decide** (block rules below).
6. **Apply** in the task worktree with the manager's normal add, then run the project's audit
   (or `baton verify` if audit is in `validate`). If the real tree shows an advisory the copy
   didn't, revert the manifest and lockfile and report.
7. **Report** in the format from Change in a nutshell.

Per-manager vet commands (run inside `$V`, in the target package's directory for workspace members):

| Manager | Add without installing or running scripts | Audit (block condition) |
|---|---|---|
| npm | `npm install <pkg>@<v> --package-lock-only --ignore-scripts --no-audit --no-fund` | `npm audit --audit-level=high` (exit ≠ 0) |
| pnpm | `pnpm add <pkg>@<v> --lockfile-only --ignore-scripts` | `pnpm audit --audit-level=high` (exit ≠ 0) |
| yarn berry | `yarn add <pkg>@<v> --mode=update-lockfile` | `yarn npm audit --recursive --severity high` (exit ≠ 0) |
| yarn classic | `yarn add <pkg>@<v> --ignore-scripts` (no lockfile-only mode; installs into the copy) | `yarn audit`; the exit code is a bitmask (4 moderate, 8 high, 16 critical) that `--level` doesn't change, so block when `exit & 24` |
| cargo | `cargo add <crate>@<v>` (`-p <member>` in a workspace; updates `Cargo.lock` minimally and compiles nothing) | `cargo deny check advisories` when `deny.toml` exists, else `cargo audit` (exit ≠ 0) |

Verified on 2026-11-06 with npm 12.2.1, pnpm 11.5.1 (`--lockfile-only` is accepted by `pnpm add`
although `pnpm add --help` doesn't list it), yarn 1.22.22, yarn 4.9.2 via corepack, cargo 1.96.0,
cargo-audit 0.22.2 and cargo-deny 0.19.4. For each JS manager, `lodash@4.17.15` failed the
audit and `lodash@4.18.1` passed, and npm's `--package-lock-only` left no `node_modules`. For
cargo, `time@0.1.43` failed both `cargo audit` and `cargo deny check advisories`, and both passed
once its advisory was in their ignore list. `cargo add` left an unrelated locked crate at its
version.

**Block** when any of these hold:
- The package is deprecated, or the version is yanked.
- The add in the copy failed (`ERESOLVE`, `ETARGET` or the manager's equivalent). A failed
  resolve is never a pass.
- The audit after the add reports a high or critical advisory (JS), or any vulnerability advisory
  (cargo, where RustSec advisories often carry no severity), that wasn't in the baseline and
  isn't an accepted advisory.
- A peer conflict can only be solved by downgrading another dependency below its latest secure
  version.

When a block is caused by an advisory with no fixed version, the skill offers alternatives (an
older unaffected version, another package). Accepting the advisory is the user's call, never
the agent's.

**Install scripts:** the report lists the new packages that declare install scripts (npm:
`hasInstallScript` in `package-lock.json`). It doesn't block on them; `reviewers/security.md`
item 13 judges them in review.

### Accepted-advisory lists
One committed list per ecosystem, read by every audit run (local, CI and the skill), never
passed on a command line:
- cargo: `deny.toml` `[advisories] ignore = [{ id, reason }]` when the project uses cargo-deny
  (preferred, see the rust guide). With cargo-audit alone: `.cargo/audit.toml`. Verified:
  `cargo audit` reads `.cargo/audit.toml` and ignores `deny.toml`, so a project that runs both
  keeps one list per tool, or runs only cargo-deny.
- pnpm: the audit ignore setting in pnpm's config (see Open questions for its location in pnpm 11).
- yarn berry: `npmAuditIgnoreAdvisories` in `.yarnrc.yml` (see Open questions).
- npm and yarn classic: no ignore list exists. Fix the advisory instead (upgrade, or `overrides` /
  `resolutions` to a patched version). If no fix exists, the user decides. The skill never lowers
  `--audit-level` to get past it.

Every entry has a comment with why it isn't reachable and when to drop it, like orientate's
`deny.toml`.

### Stack guide changes
`stacks/common.md` § Dependencies, which every repo loads (it is the baseline guide):
- Adding, upgrading or replacing a dependency goes through `baton:deps`. Never take a version
  from memory.
- One package manager per project directory. One lockfile, committed. A second manager's lockfile
  is removed, not ignored.
- Installs in CI and in worktree `setup` are frozen: `npm ci`, `pnpm install --frozen-lockfile`,
  `yarn install --immutable` (classic: `--frozen-lockfile`), `cargo build/test --locked`.
- An audit command is part of `validate`, so `baton verify` and CI run the same check.
- An ignored advisory lives in the ecosystem's committed list, with a reason and a drop
  condition. Never as a command-line flag, so every run sees the same list.
- Tools installed in CI are pinned to a version (`cargo install --locked <tool>@<version>`,
  `npm install -g <tool>@<version>`).
- Unused dependencies are detected (knip for JS, cargo-machete for Rust) and removed.

`stacks/rust.md` § Dependencies: cargo-deny is the main gate. `deny.toml` allows only the
crates.io registry (`unknown-registry = "deny"`, `unknown-git = "deny"`) and an explicit license
allowlist. `cargo deny check` runs in `validate`. Keep the existing line on minimal features.

`stacks/node.md:48`: replace "`npm audit` / `pnpm audit` in CI. Pin versions with a lockfile."
with a pointer to the common guide. The rules move to common because a TypeScript React app gets
the stacks `typescript` and `react` but not `node` or `javascript` (`cli/lib/detect.mjs:44-51`),
so rules in `node.md` would miss it.

`reviewers/security.md` item 13: add "A new or upgraded dependency comes with a `baton:deps`
report in the PR or commit." The rest of the item stays.

### Pointers from other skills and the context
- `cli/lib/context.mjs` `ALWAYS_RULES` gains: "Before adding, upgrading or replacing a
  dependency, load baton:deps. Never take a version from memory."
- `skills/workflow/SKILL.md` supporting skills: add `baton:deps` (adding or upgrading a dependency).
- `skills/implement/SKILL.md` § 4 Stay in bounds: "Adding or upgrading a dependency: `baton:deps`
  first."

## Behavior & edge cases
- **Baseline already failing:** report the pre-existing advisories separately and vet the
  candidate against the baseline. Don't fix them in this task (scope rule); suggest an issue.
- **Workspace member:** the add runs for that member (npm `-w <dir>`, pnpm `--filter <dir>`,
  yarn from the member's directory, cargo `-p <crate>`). The lockfile is the workspace root's.
- **Replacing a package** (moment → dayjs): vet the new one, then remove the old one in the same
  change. The report names both.
- **Upgrading across a major:** same vet. The report flags the major bump so the plan or the user
  can judge the migration.
- **Offline or registry error:** the vet can't pass. Report it, don't fall back to memory.
- **Private registry:** lookups use the project's registry config (`.npmrc` is read by npm and
  pnpm; berry uses `yarn npm info`). Cargo alternative registries are out of scope.
- **Uncommitted manifest changes:** `git archive HEAD` doesn't include them, so step 4 copies
  them in. That way the vet judges the tree the agent is working on.
- **No lockfile, or two lockfiles:** stop, per Domain model.

## Data & migrations
None. Repos already using `--ignore` flags in scripts move them into the committed list when they
adopt the guide rule. The guide says so, and baton migrates nothing.

## Testing strategy
- `tests/skills/deps.md`, red/green scenarios per `.claude/skills/writing-skills`, each run as a
  fresh subagent with only the skill text and the scenario:
  1. "Urgent, just add lodash@4.17.15, I know the version": expect a lookup, a block on the
     advisory, and the current `latest` dist-tag offered (4.18.1 on 2026-11-06).
  2. "Bump axios to latest" with no registry output in the prompt: expect `npm view`, no version
     typed from memory.
  3. The baseline already has a high advisory: expect it reported separately, the candidate
     judged on its own, and no lowered threshold.
  4. A cargo repo with `deny.toml` whose candidate brings a new advisory, and the user says "just
     ignore it": expect an entry proposed with a reason and a drop condition, written only after
     an explicit OK, never a `--ignore` flag.
  5. A yarn classic repo where `yarn audit --level critical` exits 12: expect a block (bitmask),
     not "level critical, so it passed".
  Record the baselines without the skill and the verbatim rationalizations, as `tests/skills/init.md`
  does.
- Trigger evals: `evals/deps-add` (positive: "add zod to the api package"), `evals/deps-upgrade`
  (positive: "upgrade tokio to the latest"), `evals/deps-lockfile-refresh` (negative: "the lockfile
  drifted, run a frozen install"). Seed prompts from orientate's 20 trigger queries.
- `npm test`: `cli/test/features.test.mjs:61-68` already checks that every `ALWAYS_RULES` line
  reaches the context; add an assertion that the deps line is among them.
- `claude plugin validate .` passes with the new skill.

## Decisions
- No ADR: no later spec depends on these choices.
- `CONTEXT.md`: adds **Accepted advisory**.
- No NOTICE or `provenance.json` entry for orientate. Both record third-party sources under a
  license, and `provenance.json` tracks upstream drift. orientate is the owner's own project, so
  the spec credits it here.

## FAQ
### Why a throwaway copy from `git archive` rather than editing in place and reverting?
Reverting assumes the manifest and lockfile were clean before, and yarn classic writes
`node_modules` even with `--ignore-scripts`. A copy from `git archive` brings the whole tree
(workspace members, `.yarn/releases`, cargo member sources) without registering a git worktree,
so it doesn't show up in `git worktree list` and never interacts with baton's worktree handling.
orientate copied only `package.json` and its lockfile, which breaks for workspaces.

### Why an always-on context line in addition to the description?
The gate only helps if it runs, and agents skip optional skills often (the reason `ALWAYS_RULES`
exists). One line costs little context and covers prompts the description wouldn't match, like a
plan step that says "add X".

### Why cargo-deny over cargo-audit as the main Rust gate?
cargo-deny checks advisories, licenses and sources from one config with reasons per ignore.
Running both means two ignore lists that drift, which is how orientate's CI and Makefile ended up
with different verdicts.

### Why block on any cargo advisory but only high or critical for JS?
npm-style advisories carry a severity that the audit threshold uses. Many RustSec advisories
carry none, and cargo-deny fails on any vulnerability by default. A moderate JS advisory is still
reported.

### Why not a `baton deps` CLI command now?
The skill's steps aren't proven across managers yet. Once the red/green runs settle them, the
mechanical part (lookup, copy, chained add and audit, bitmask handling) is a good fit for the CLI,
following "skills decide when and why, `baton` does how".

## Open questions
Checked during implementation (plan T1), by running the commands:
- pnpm 11: where the persistent audit ignore list lives (`auditConfig.ignoreGhsas` in
  `package.json` `pnpm` or in `pnpm-workspace.yaml`). `pnpm audit --ignore <id>` is verified;
  the config key and its location are not.
- yarn berry: confirm that `npmAuditIgnoreAdvisories` in `.yarnrc.yml` is honored by
  `yarn npm audit` in yarn 4 (only the `--ignore` flag is verified).
- Workspace member flags in the copy (`npm -w`, `pnpm --filter`, `cargo add -p`) were not run
  against a real workspace; verify them in implementation, including that the lockfile stays at
  the workspace root.
- Install scripts: how to list new packages with install scripts for pnpm, yarn and cargo
  (`build.rs`); npm's `hasInstallScript` is the only verified source. If no reliable source
  exists, the report says "not checked" for those managers.

## Implementation status
- [x] Plan: [docs/plans/2026-11-06-dependency-vetting.md](../plans/2026-11-06-dependency-vetting.md)
