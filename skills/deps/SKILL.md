---
name: deps
description: Use when adding, upgrading or replacing a dependency in package.json or Cargo.toml, when choosing which version or which package to use, or when asked whether a dependency is safe, in a baton repo.
argument-hint: "<package>[@version]"
---

# Vet a dependency

**Never write a version you didn't read from the registry in this session, or add it to the
worktree before it passed the vet**, however urgent or user-named.

## 1. Identify

Package, manifest, reason; for a category, ask which. Manager: nearest lockfile above the
manifest. `package-lock.json` npm, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn (berry with `.yarnrc.yml` or `packageManager:
"yarn@2+"`, else classic), `Cargo.lock` cargo. Stop on `bun.lock`/`bun.lockb`, two
lockfiles in one directory, or none. `<dir>`: the lockfile's directory.

## 2. Look up

JS: `npm view <pkg> dist-tags` (`latest`, not a pre-release), then `npm view <pkg>@<v>
deprecated` and `npm view <pkg>@<v> peerDependencies`, one field per call. Berry, registry set
only in `.yarnrc.yml`: `yarn npm info <pkg> --fields dist-tags,deprecated,peerDependencies
--json`. cargo: `cargo info <crate>`; yanked: the `<v>` line of `curl -fsS
https://index.crates.io/<prefix>/<crate>`, prefix `1`, `2`, `3/<first char>` by length, else
`se/rd` (serde); not the crates.io API. Registry errors or silence fail the vet.

## 3. Peer compatibility (JS)

On a `peerDependencies` conflict with the manifest, take the newest fitting version; say so.

## 4. Vet in a throwaway copy

```bash
cd "$(git rev-parse --show-toplevel)"; V=$(mktemp -d); git archive HEAD | tar -x -C "$V"
```

Copy in uncommitted manifests, lockfile, manager config. **In `$V/<dir>`, not `$V`:**
baseline audit, `<add> && <audit>`, `rm -rf "$V"`. Member: npm `-w <member dir>`,
pnpm `--filter ./<member dir>`, `yarn workspace <name> add`, cargo `-p <crate>`.

| Manager | Add | Audit, block when exit ≠ 0 |
|---|---|---|
| npm | `npm install <pkg>@<v> --package-lock-only --ignore-scripts` | `npm audit --audit-level=high` |
| pnpm | `pnpm add <pkg>@<v> --lockfile-only --ignore-scripts` | `pnpm audit --audit-level=high` |
| yarn berry | `yarn add <pkg>@<v> --mode=update-lockfile` | `yarn npm audit --all --recursive --severity high` |
| yarn classic | `yarn add <pkg>@<v> --ignore-scripts` | `yarn audit`; **block when `exit & 24` ≠ 0**, any `--level` |
| cargo | `cargo add <crate>@<v>` | `cargo deny check advisories` with `deny.toml`, else `cargo audit` |

An audit error or missing report fails the vet.

Install scripts: npm `hasInstallScript` in the lockfile, cargo `custom-build` targets in `cargo
metadata --format-version 1 --locked`, pnpm, yarn "not checked".

## 5. Decide

Block when: deprecated or yanked; the add failed; a new advisory (JS high or critical, cargo
any) not accepted; a peer fit needs another dependency below its latest secure version. Offer
alternatives. Baseline advisories: report separately, suggest an issue.

**Never add an accepted advisory, lower a threshold or pass `--ignore`/`--force` without the
user's explicit OK to that exact change**, even after "just ignore it". Propose an entry with
reason and drop condition; wait: cargo `deny.toml` `[advisories] ignore`, else
`.cargo/audit.toml`; pnpm `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`; yarn berry
`npmAuditIgnoreAdvisories` in `.yarnrc.yml`, the numeric `ID` from `--json`, not the GHSA; npm
and yarn classic: none.

## 6. Apply

First `S=$(mktemp -d); cp <manifest> <lockfile> "$S"/`. After a pass, in `<dir>`: the normal
add (replacing: remove the old), then the audit or `baton verify`; on a failed add or an
advisory the copy didn't show, restore both from `$S` (not HEAD), report. Blocked: `cmp` with
`$S` passes.

## 7. Report

```text
## baton:deps: <package>
- Manager: <manager> (<lockfile path>)
- Version chosen: <v>, <why, major bump?>, checked <date>
- Replaces: <old package, removed/n/a>
- Deprecated: <no/yes: message>   Yanked: <yes/no/n/a>   Peer compat: <ok/conflict>
- Audit: <result> (baseline <result>)
- Install scripts, new packages: <list/none/not checked>
Action: <added to/upgraded in/blocked, nothing changed/apply failed: <error>, reverted>
```
