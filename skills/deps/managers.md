# baton:deps: per-manager detail

Supporting file for `skills/deps/SKILL.md`. `<dir>` is the directory of the detected lockfile.

## Look up (step 2)

- JS: `npm view <pkg> dist-tags` (`latest`, not a pre-release), then
  `npm view <pkg>@<v> deprecated` and `npm view <pkg>@<v> peerDependencies`, one field per
  call (with several, npm prints a bare value when one is set). Berry with a registry only in
  `.yarnrc.yml`: `yarn npm info <pkg> --fields dist-tags,deprecated,peerDependencies --json`.
- cargo: `cargo info <crate>` (in a project already using it, the `latest` in parentheses).
  Yanked: `curl -fsS https://index.crates.io/<prefix>/<crate>`, a JSON line per version;
  `<prefix>` from the lowercased name: `1`, `2`, `3/<c1>`, else `<c1c2>/<c3c4>` (`se/rd/serde`).
  No line whose `vers` is `<v>`: the lookup failed. Never the crates.io web API.

## Vet commands (step 4)

| Manager | Add | Audit, block when |
|---|---|---|
| npm | `npm install <pkg>@<v> --package-lock-only --ignore-scripts --no-audit --no-fund` | `npm audit --audit-level=high`, exit ≠ 0 |
| pnpm | `pnpm add <pkg>@<v> --lockfile-only --ignore-scripts` | `pnpm audit --audit-level=high`, exit ≠ 0 |
| yarn berry | `yarn add <pkg>@<v> --mode=update-lockfile` | `yarn npm audit --all --recursive --severity high`, exit ≠ 0 |
| yarn classic | `yarn add <pkg>@<v> --ignore-scripts` | `yarn audit`, `exit & 24` ≠ 0 (below) |
| cargo | `cargo add <crate>@<v>` | `cargo deny check advisories` with `deny.toml`, else `cargo audit`; exit ≠ 0 |

yarn classic: `yarn audit` exits with a bitmask (4 moderate, 8 high, 16 critical) that `--level`
doesn't change. Exit 1 is also a request error, so the exit counts only with the
`N vulnerabilities found` summary.

## Workspace members (step 4)

Run from `$V/<dir>` (the workspace root holding the lockfile) with the member flag: npm
`-w <member dir>`, pnpm `--filter ./<member dir>`, yarn `yarn workspace <name> add`, cargo
`-p <crate>`. A package whose lockfile sits in its own directory is not a member: run there with
no flag.

## Install scripts in new packages (step 4)

npm: `hasInstallScript` in `package-lock.json`. cargo: a `custom-build` target in
`cargo metadata --format-version 1 --locked`. pnpm, yarn: "not checked".

## Ignore lists (step 5)

Only proposed, and written only after the user's explicit OK to that exact entry:

- cargo `deny.toml` `[advisories] ignore`, else `.cargo/audit.toml`.
- pnpm `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` (`pnpm audit --ignore` writes there:
  don't run it).
- yarn berry `npmAuditIgnoreAdvisories` in `.yarnrc.yml`, with the
  numeric `ID` from `--json`, not the GHSA.
- npm and yarn classic: none.
