# ADR-0001: The changelog and version are generated at release

- Status: proposed
- Date: 2026-10-28
- Deciders: Arnold Gandarillas
- Related: [release phase spec](../specs/2026-10-28-release-phase.md)

## Context
Every PR added a line to `CHANGELOG.md`, so any two open PRs conflicted on it. baton uses issues
instead of a roadmap file precisely so that parallel agents don't all edit one file. Versions
were bumped by hand in several files. Squash merges with Conventional Commit PR titles already
give one well-typed commit per change on the base branch.

## Options considered
1. **Hand-edited CHANGELOG** (status quo): free-form notes, but conflicts on every pair of PRs.
2. **Changeset files per PR**, combined at release: no conflicts, but an extra file per PR and
   a release step that someone runs.
3. **Generated from commits by release-please**: no per-PR files, versions computed from the
   commit types, tag and release created on merge. Notes are only as good as the PR titles.

## Decision
Option 3. PRs never edit `CHANGELOG.md` or version files. The PR title is the changelog entry,
and release-please produces the version, the CHANGELOG section, the tag and the GitHub Release
when the release PR is merged.

## Consequences
- PR titles must be written for users, with `feat`/`fix` chosen by effect. Skill changes that
  alter agent behavior are `feat` or `fix`, not `docs`.
- `baton done` refuses PRs that edit `CHANGELOG.md` in repos where release-please is set up.
- Each repo needs a `RELEASE_PLEASE_TOKEN` secret. Someone owns and rotates it.
- Squash merging is required for releases to work, because every commit on the base branch has to
  be a Conventional Commit.
- Revisit if per-package versions or registry publishing become needed.
