---
name: deps
description: Use when adding, upgrading or replacing a dependency in package.json or Cargo.toml, when choosing which version or which package to use, or when asked whether a dependency is safe, in a baton repo.
argument-hint: "<package>[@version]"
---

# Vet a dependency

**Never write a version you didn't read from the registry in this session, or add it to the
worktree before it passed the vet**, however urgent or user-named.

## 1. Identify

Package, manifest, reason; for a category ("a date library"), ask which.
Manager: nearest lockfile walking up from the manifest. `package-lock.json` npm,
`pnpm-lock.yaml` pnpm, `yarn.lock` yarn (berry with `.yarnrc.yml` or `packageManager: "yarn@2+"`,
else classic), `Cargo.lock` cargo (`cargo locate-project --workspace`). Stop and report on
`bun.lock`/`bun.lockb` (unsupported), two lockfiles in one directory, or none.

## 2. Look up

- JS: `npm view <pkg> dist-tags` (`latest`, not a pre-release), then
  `npm view <pkg>@<v> deprecated` and `npm view <pkg>@<v> peerDependencies`, one field per
  call (with several, npm prints a bare value when one is set). Berry with a registry only in
  `.yarnrc.yml`: `yarn npm info <pkg> --fields dist-tags,deprecated,peerDependencies --json`.
- cargo: `cargo info <crate>` (in a project already using it, the `latest` in parentheses).
  Yanked: `curl -fsS https://index.crates.io/<prefix>/<crate>`, a JSON line per version;
  `<prefix>` from the lowercased name: `1`, `2`, `3/<c1>`, else `<c1c2>/<c3c4>` (`se/rd/serde`).
  No line whose `vers` is `<v>`: the lookup failed. Never the crates.io web API.

Registry error or offline, here or in an audit: the vet fails, no fallback to memory.

## 3. Peer compatibility (JS)

On a conflict, take the newest version that fits and say so.

## 4. Vet in a throwaway copy

From the repo root (from a subdirectory, `git archive` copies only that subdirectory):

```bash
cd "$(git rev-parse --show-toplevel)"; V=$(mktemp -d); git archive HEAD | tar -x -C "$V"
```

Copy in uncommitted manifests, lockfile and manager config. In `$V`: baseline audit,
`<add> && <audit>`, `rm -rf "$V"`. Workspace members, from the root: npm `-w <dir>`, pnpm
`--filter ./<dir>`, yarn `yarn workspace <name> add`, cargo `-p <crate>`.

| Manager | Add | Audit, block when |
|---|---|---|
| npm | `npm install <pkg>@<v> --package-lock-only --ignore-scripts --no-audit --no-fund` | `npm audit --audit-level=high`, exit ≠ 0 |
| pnpm | `pnpm add <pkg>@<v> --lockfile-only --ignore-scripts` | `pnpm audit --audit-level=high`, exit ≠ 0 |
| yarn berry | `yarn add <pkg>@<v> --mode=update-lockfile` | `yarn npm audit --all --recursive --severity high`, exit ≠ 0 |
| yarn classic | `yarn add <pkg>@<v> --ignore-scripts` | `yarn audit`, `exit & 24` ≠ 0 (a bitmask `--level` doesn't change); counts only with its `N vulnerabilities found` summary, as exit 1 is also a request error |
| cargo | `cargo add <crate>@<v>` | `cargo deny check advisories` with `deny.toml`, else `cargo audit`; exit ≠ 0 |

An audit counts only when its output lists the advisories or a summary. An `error` line, an
endpoint error or no report, in the baseline or after the add, fails the vet with that error
on the Audit line, never compared with the other run.

Install scripts in new packages: npm `hasInstallScript` in `package-lock.json`; cargo a
`custom-build` target in `cargo metadata --format-version 1 --locked`; pnpm, yarn "not checked".

## 5. Decide

Block when: deprecated or yanked; the add failed (a failed resolve never passes); an advisory
(JS high or critical, cargo any) not in the baseline and not accepted; a peer fit needs another
dependency below its latest secure version. Offer another version or package. Baseline
advisories: report separately, suggest an issue.

**Never add an accepted advisory, lower a threshold or pass `--ignore`/`--force` without the
user's explicit OK to that exact change**, even after "just ignore it". Propose the entry with
a reason and a drop condition, then wait. Lists: `deny.toml` `[advisories] ignore`, else
`.cargo/audit.toml`; pnpm `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` (`pnpm audit
--ignore` writes there: don't run it); berry `npmAuditIgnoreAdvisories` in `.yarnrc.yml`, the
numeric `ID` from `--json`, not the GHSA. npm and classic: none.

## 6. Apply

After a pass only: the manager's normal add in the worktree, then the project's audit or
`baton verify`; on a new advisory, or if the add or verify fails, revert
(`git checkout -- <manifest> <lockfile>`) and report it. Blocked: manifest and lockfile stay byte-identical
(`git diff --exit-code -- <manifest> <lockfile>`). Replacing: remove the old package too.

## 7. Report

```text
## baton:deps: <package>
- Manager: <manager> (<lockfile path>)
- Version chosen: <v>, <why, major bump?> (dist-tag latest, checked <date>)
- Deprecated: <yes/no>   Yanked: <yes/no/n/a>   Peer compat: <ok/conflict>
- Audit: <result> (baseline <result>)
- Install scripts in new packages: <list/none/not checked>
Action: <added to/upgraded in/blocked, nothing changed/apply failed: <error>, reverted>
```
