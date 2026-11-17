# Staying current

Guides and skills go stale as Claude Code, libraries and the upstream projects they adapt
change. [`provenance.json`](../provenance.json) records the upstream commit each adapted file
came from and the version-dependent facts the guides assert (e.g. `queryClient.query` needs
TanStack Query >= 5.102).

- `baton upstream` (for maintainers, requires `gh`): reports upstream changes to adapted files
  since their baseline, and new releases outside the asserted versions. A weekly GitHub Action
  ([`drift.yml`](../.github/workflows/drift.yml)) keeps one `drift` issue updated with the
  result.
- `baton doctor` (in a project, offline): checks the config, tools used by `setup`/`validate`,
  stacks detected but not enabled, and installed dependencies (npm, pnpm, Cargo lockfiles)
  outside what the guides assume.
- `npm test` fails if a recorded fact no longer appears in its guide.
