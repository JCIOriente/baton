---
name: deps
description: Use when adding, upgrading or replacing a dependency in package.json or Cargo.toml, when choosing which version or which package to use, or when asked whether a dependency is safe, in a baton repo.
argument-hint: "<package>[@version]"
---

# Vet a dependency

**Never write a version you didn't read from the registry in this session, or add it to the
worktree before it passed the vet**, however urgent or user-named.

Per-manager commands and lists: `${CLAUDE_PLUGIN_ROOT}/skills/deps/managers.md`; read it
before step 2.

## 1. Identify

Package, manifest, reason; for a category ("a date library"), ask which. Replacing: the new
package is the candidate, the old one goes in step 6.
Manager: nearest lockfile walking up from the manifest. `package-lock.json` npm,
`pnpm-lock.yaml` pnpm, `yarn.lock` yarn (berry with `.yarnrc.yml` or `packageManager: "yarn@2+"`,
else classic), `Cargo.lock` cargo (`cargo locate-project --workspace`). Stop and report on
`bun.lock`/`bun.lockb` (unsupported), two lockfiles in one directory, or none. `<dir>` below is
the lockfile's directory, relative to the repo root.

## 2. Look up

Latest non-pre-release version, deprecated, `peerDependencies` (JS), yanked (cargo), with the
commands in managers.md. Registry error or offline, here or in an audit: the vet fails, no
fallback to memory.

## 3. Peer compatibility (JS)

Compare the candidate's `peerDependencies` from step 2 with the versions in the manifest. On a
conflict, take the newest version that fits and say so.

## 4. Vet in a throwaway copy

From the repo root (from a subdirectory, `git archive` copies only that subdirectory):

```bash
cd "$(git rev-parse --show-toplevel)"; V=$(mktemp -d); git archive HEAD | tar -x -C "$V"
```

Copy in uncommitted manifests, lockfile and manager config. **In `$V/<dir>`, not `$V`:**
baseline audit, `<add> && <audit>` (a workspace member with its member flag), then
`rm -rf "$V"`. List install scripts in new packages.

Commands per manager: managers.md. Adds are lockfile-only without scripts (yarn classic
installs into the copy); audits block at high (cargo: any advisory), exit ≠ 0, except **yarn
classic: block when `exit & 24` ≠ 0**, whatever `--level` says.

An audit counts only when its output lists the advisories or a summary. An `error` line, an
endpoint error or no report, in the baseline or after the add, fails the vet with that error
on the Audit line, never compared with the other run.

## 5. Decide

Block when: deprecated or yanked; the add failed (a failed resolve never passes); an advisory
(JS high or critical, cargo any) not in the baseline and not accepted; a peer fit needs another
dependency below its latest secure version. Offer another version or package. Baseline
advisories: report separately, suggest an issue.

**Never add an accepted advisory, lower a threshold or pass `--ignore`/`--force` without the
user's explicit OK to that exact change**, even after "just ignore it". Propose the ignore-list
entry (managers.md) with a reason and a drop condition, then wait.

## 6. Apply

After a pass only, in `<dir>`: the manager's normal add (replacing: remove the old package too),
then the project's audit or `baton verify`; on a new advisory, or if the add or verify fails,
revert (`git checkout -- <manifest> <lockfile>`) and report it. Blocked: manifest and lockfile
stay byte-identical (`git diff --exit-code -- <manifest> <lockfile>`).

## 7. Report

```text
## baton:deps: <package>
- Manager: <manager> (<lockfile path>)
- Version chosen: <v>, <why, major bump?> (dist-tag latest, checked <date>)
- Replaces: <old package, removed/n/a>
- Deprecated: <yes/no>   Yanked: <yes/no/n/a>   Peer compat: <ok/conflict>
- Audit: <result> (baseline <result>)
- Install scripts in new packages: <list/none/not checked>
Action: <added to/upgraded in/blocked, nothing changed/apply failed: <error>, reverted>
```
