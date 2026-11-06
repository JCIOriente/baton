---
name: deps
description: Use when adding, upgrading or replacing a dependency in package.json or Cargo.toml, when choosing which version or which package to use, or when asked whether a dependency is safe, in a baton repo.
argument-hint: "<package>[@version]"
---

# Dependencies

**Never write a version you didn't read from the registry in this session, or add it to the
worktree before it passed the vet**, however urgent or user-named.

## 1. Identify

Package, manifest, reason; category only: ask which. Manager: nearest same-ecosystem lockfile
at/above the manifest. `package-lock.json` npm, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn (berry
with `.yarnrc.yml` or `packageManager: "yarn@2+"`, else classic), `Cargo.lock` cargo. Stop
(no lookup) on `bun.lock`/`bun.lockb`, two JS lockfiles in one directory, none, cargo
`registry =`/source replacement. `<dir>`: lockfile directory. `<S>`, `<V>`: `mktemp -d`
outputs, **typed literally: tool calls share no variables**. `cp <manifest> <lockfile> <S>`.

## 2. Look up

JS: `npm view <pkg> dist-tags` (`latest`, not pre-release), then `npm view <pkg>@<v>
deprecated`, `peerDependencies`, one field per call. Berry, registry only in `.yarnrc.yml`:
`yarn npm info <pkg> --fields dist-tags --json`, then
`yarn npm info <pkg>@<v> --fields deprecated,peerDependencies --json`. cargo: `cargo info
<crate>`; yanked: the `<v>` line of `curl -fsS https://index.crates.io/<prefix>/<crate>`, all
lowercase, prefix `1`, `2`, `3/<first char>` by length, else `se/rd/serde`; not the crates.io
API. Non-zero exit, timeout or no `<v>` line:
vet fails; empty with exit 0: unset.

## 3. Peers (JS)

Manifest conflict: newest fitting version, say so.

## 4. Vet in a copy

`cd "$(git rev-parse --show-toplevel)" && git archive HEAD | tar -x -C <V>`; copy in
uncommitted manifests, lockfile, manager config. **`cd <V>/<dir> &&`, not `<V>`:** baseline
audit, `<add> && <audit>`; `rm -rf <V>`. Member: npm `-w <member>`, pnpm `--filter ./<member>`,
`yarn workspace <name> add`, cargo `-p <crate>`.

| Manager | Add | Audit; block on exit ≠ 0, error, no report |
|---|---|---|
| npm | `npm install <pkg>@<v> --package-lock-only --ignore-scripts` | `npm audit --audit-level=high` |
| pnpm | `pnpm add <pkg>@<v> --lockfile-only --ignore-scripts` | `pnpm audit --audit-level=high` |
| yarn berry | `yarn add <pkg>@<v> --mode=update-lockfile` | `yarn npm audit --all --recursive --severity high` |
| yarn classic | `yarn add <pkg>@<v> --ignore-scripts` | `yarn audit`; **block without `N vulnerabilities found`, else on `exit & 24` ≠ 0**, any `--level` |
| cargo | `cargo add <crate>@<v>` | `cargo deny check advisories` with `deny.toml`, else `cargo audit` |

Install scripts (report only): npm `hasInstallScript`, cargo `custom-build` (`cargo
metadata --format-version 1 --locked`); pnpm/yarn: "not checked".

## 5. Decide

Block when: deprecated or yanked; add failed; new advisory (JS high/critical, cargo any) not
accepted; peer fit needs another dependency below its latest secure version. Offer
alternatives. Baseline advisories: report separately, suggest an issue.

**Never add an accepted advisory, lower a threshold or pass `--ignore`/`--force` without the
user's explicit OK to that exact change**, even after "just ignore it". Propose an entry
(reason, drop condition); wait: cargo `deny.toml` `[advisories] ignore`, else
`.cargo/audit.toml`; pnpm `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`; berry
`npmAuditIgnoreAdvisories` in `.yarnrc.yml`, the numeric `ID` from `--json`, not the GHSA; npm,
yarn classic: none.

## 6. Apply

Passed: in `<dir>`, the Add without
`--package-lock-only`/`--lockfile-only`/`--mode`/`--ignore-scripts` (replacing: remove old),
then audit (or `baton verify` if it audits). Failed add, audit error, no report, or advisory
the copy didn't show: restore both from `<S>` (not HEAD), then JS frozen install (`npm ci`).
Blocked: `cmp` with `<S>` passes.

## 7. Report

```text
## baton:deps: <package>
- Manager: <manager> (<lockfile>)
- Version: <v>, <why, major bump?>, checked <date>
- Replaces: <old, removed/n/a>
- Deprecated: <no/yes: message>   Yanked: <yes/no/n/a>   Peers: <ok/conflict>
- Audit: <result> (baseline <result>; worktree <result/error>)
- Install scripts: <new packages/none/not checked>
Action: <added to/upgraded in/blocked, nothing changed/apply failed: <error>, reverted>
```
