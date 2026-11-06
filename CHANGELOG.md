# Changelog

Generated from PR titles at release by release-please. Versions follow
[semver](https://semver.org); before 1.0, minor versions may change behavior.

## [0.3.0](https://github.com/JCIOriente/baton/compare/v0.2.0...v0.3.0) (2026-11-06)


### Features

* **release:** baton done refuses PR bodies that misuse the commit override marker ([#43](https://github.com/JCIOriente/baton/issues/43)) ([00daded](https://github.com/JCIOriente/baton/commit/00daded9f9550de666347ce34fed2ccc07ce2efd))
* **release:** run workflows on ubuntu-26.04 and Node 26 ([#40](https://github.com/JCIOriente/baton/issues/40)) ([de68abe](https://github.com/JCIOriente/baton/commit/de68abe59bab53270bd983ab31604d448bd761c3))
* **release:** update a release PR that is behind the base branch before merging ([#44](https://github.com/JCIOriente/baton/issues/44)) ([fdc78eb](https://github.com/JCIOriente/baton/commit/fdc78eb16028c2369f37aaf04f9b0950c0410c9e))

## [0.2.0](https://github.com/JCIOriente/baton/compare/v0.1.0...v0.2.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* move to JCIOriente/baton and rename the marketplace to jcioriente; reinstall with `claude plugin marketplace add JCIOriente/baton` then `claude plugin install baton@jcioriente`

### Features

* **commits:** commit messages are subject only unless the why needs a short body of at most two paragraphs ([b54cd2c](https://github.com/JCIOriente/baton/commit/b54cd2c66b14c88594d3eee0aaf0644f9ba732c5))
* **config:** opt-in release config and the CHANGELOG guard in baton done ([#29](https://github.com/JCIOriente/baton/issues/29)) ([d7c8c70](https://github.com/JCIOriente/baton/commit/d7c8c70b68a34e63495aa06f811cb8ae6e518367))
* **evals:** skill trigger evals (`make evals`), one case per skill plus negative cases ([4f247a3](https://github.com/JCIOriente/baton/commit/4f247a379a5c2887032ba7450548231ac944a461))
* **init:** opt-in release-please setup with v tags and a protected release token ([#31](https://github.com/JCIOriente/baton/issues/31)) ([a215ba5](https://github.com/JCIOriente/baton/commit/a215ba5bbc504e13b79d95441637374d8a216c7a))
* **init:** suggest squash commits that use the PR title and body ([#16](https://github.com/JCIOriente/baton/issues/16)) ([284fa8f](https://github.com/JCIOriente/baton/commit/284fa8f486718f49a98079f1dfc417fbe1c82578))
* **integrate:** PR body is two short paragraphs, no attribution lines ([#8](https://github.com/JCIOriente/baton/issues/8)) ([5f7ca5d](https://github.com/JCIOriente/baton/commit/5f7ca5d6a4b448b774e41798b37a3833f622eb0d))
* **integrate:** PR title rules for type, breaking changes and the changelog ([#28](https://github.com/JCIOriente/baton/issues/28)) ([4388daa](https://github.com/JCIOriente/baton/commit/4388daaa2464fb008830d12649ce01faf6787b41))
* move to JCIOriente/baton and rename the marketplace to jcioriente; reinstall with `claude plugin marketplace add JCIOriente/baton` then `claude plugin install baton@jcioriente` ([db743da](https://github.com/JCIOriente/baton/commit/db743da38186faf1aec3e05983cd33d49bacf64f))
* **release:** baton generates its changelog, versions and v tags with release-please ([#32](https://github.com/JCIOriente/baton/issues/32)) ([4790185](https://github.com/JCIOriente/baton/commit/4790185f61ccf1594d867285bcc9ec68efb61522))
* **release:** on-demand baton:release skill to check, fix and cut releases ([#30](https://github.com/JCIOriente/baton/issues/30)) ([c9dedd9](https://github.com/JCIOriente/baton/commit/c9dedd9315beb6d3a4abdfe459a5a3e0dba021ec))
* **release:** publish to npm and crates.io from the release with credential-free builds ([#33](https://github.com/JCIOriente/baton/issues/33)) ([48b834e](https://github.com/JCIOriente/baton/commit/48b834e0a4265f1903816b376cdf745b287682f5))
* **workflow:** route bugs and failing tests to baton:debug even when the cause looks obvious ([4f247a3](https://github.com/JCIOriente/baton/commit/4f247a379a5c2887032ba7450548231ac944a461))


### Bug Fixes

* **spec:** write an ADR only for choices later specs must follow ([#5](https://github.com/JCIOriente/baton/issues/5)) ([62c9884](https://github.com/JCIOriente/baton/commit/62c988490c1aa496330895b68c46a2a6a3476ea5))

## 0.1.0 — 2026-10-22

First public release.

- Workflow skills: workflow, init, spec, plan, backlog, implement, verify, review, integrate,
  parallel, debug, retro.
- `baton` CLI: race-safe claims on GitHub Issues, one worktree per task with setup and a baseline
  run, project-defined validation, reviewer selection, PR creation with a review gate, `doctor`
  and `upstream` drift checks.
- Opt-in stack guides (TypeScript, JavaScript, React, Node, Rust, tokio-postgres, Postgres, API,
  OpenAPI, i18n, E2E) and reviewer briefs.
- Hooks: session context, optional fact gate.
