# ADR-0003: `validate` is the repo's gate list, and `baton verify` is its only entry point

- Status: accepted
- Date: 2026-11-16
- Deciders: Arnold Gandarillas
- Related: [gates core spec](../specs/2026-11-16-gates-core.md), #137

## Context
Repos declared their checks as a single `validate` step (`make ci`), and CI kept its own list.
baton could see only one pass or fail. It couldn't report which kind of check was missing, run
a check as advisory, or tell a partial run from a full one. The two lists drifted (Orientate).
The engineering standard (#137) adds gates in later specs (layout guards, presets, kind
profiles), so they need one place to plug into.

## Options considered
1. **One entry-point step plus a gate map.** `validate` stays `make ci`, and a separate map
   names the recipe for each gate. CI runs the repo's script with no baton. Per-gate results,
   advisory steps and stages can't be reported, and the map can drift from the script.
2. **One step per check in `validate`.** Each step names the catalog gates it covers, its
   stages and whether it blocks. `baton verify` runs it locally and in CI. CI needs Node and
   the baton CLI.

## Decision
Option 2. `validate` is the gate list: one step per check, each calling a recipe of the repo's
own runner and naming gates from baton's fixed catalog. `baton verify --stage <stage>` is the
only entry point, for the commit hook, local runs, `baton start` and `baton done`, and CI. The
CLI is published to npm as `@jcioriente/baton` so any repo's CI can run it.

## Consequences
- New gates (structure, generated-file drift, budgets) are catalog entries plus steps, never a
  second list.
- Every repo's CI depends on the baton CLI at a pinned version. A baton release that breaks
  `verify` breaks CI for repos that upgrade, so `verify`'s config and output are a public
  interface.
- Adding a gate name is a baton change. Repos can't invent gate names, so `baton doctor` can
  tell a gap from a typo.
- A repo's `make ci` (or equivalent) may remain as a convenience, but `validate` is the source
  of truth.
