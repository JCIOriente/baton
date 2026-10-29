# ADR-0001: The changelog and version are generated at release

- Status: accepted
- Date: 2026-10-28
- Deciders: Arnold Gandarillas
- Related: [release phase spec](../specs/2026-10-28-release-phase.md)

## Context
Every PR added a line to `CHANGELOG.md`, so any two open PRs conflicted on it. baton uses issues
instead of a roadmap file precisely so that parallel agents don't all edit one file. Versions
were bumped by hand in several files. Squash merges with Conventional Commit PR titles already
give one well-typed commit per change on the base branch. Not every repo that adopts baton
wants versioned releases or a changelog at all, and the ones that publish packages need the
registry version, the tag and the notes to always agree.

## Options considered
1. **Hand-edited CHANGELOG** (status quo): free-form notes, but conflicts on every pair of PRs.
2. **Changeset files per PR**, combined at release: no conflicts, but an extra file per PR and
   a release step that someone runs.
3. **Generated from commits by release-please**: no per-PR files, versions computed from the
   commit types, tag and release created on merge. Notes are only as good as the PR titles.

## Decision
Option 3, as an opt-in feature: `release.enabled` in `.baton/config.json`, off by default and
offered by `baton:init`. In repos that enable it, PRs never edit `CHANGELOG.md` or version files.
The PR title is the changelog entry, and release-please produces the version, the CHANGELOG
section, the tag and the GitHub Release when the release PR is merged. Tags and release names
are a clean `v<version>` with no package name. Packages are published only by CI, from that
tag, after it exists. In repos that don't enable it, baton creates no changelog and says
nothing about one.

## Consequences
- One version, set in one place: the tag is `v` plus the manifest version, and the published
  package carries the same version. Nobody tags by hand, and only CI publishes, except a
  package's first version, which the registry requires by hand.
- PR titles must be written for users, with `feat`/`fix` chosen by effect. Skill changes that
  alter agent behavior are `feat` or `fix`, not `docs`.
- `baton done` refuses PRs that edit `CHANGELOG.md` once releases are enabled on the base branch.
- Each enabling repo needs a `RELEASE_PLEASE_TOKEN` secret. Someone owns it and rotates it
  before it expires. Registry publishing uses trusted publishing (OIDC), so there is no
  long-lived registry token.
- Squash merging is required for releases, because every commit on the base branch has to be a
  Conventional Commit. The config rejects `release.enabled` otherwise.
- A tag can exist before its package is published, never the reverse. A failed publish is
  re-run, not re-tagged.
- Revisit if per-package versions in a monorepo become needed.
