# Changelog

Generated from PR titles at release by release-please. Versions follow
[semver](https://semver.org); before 1.0, minor versions may change behavior.

## [0.7.0](https://github.com/JCIOriente/baton/compare/v0.6.0...v0.7.0) (2026-11-14)


### Features

* **context:** make the user's-call rule always on ([#144](https://github.com/JCIOriente/baton/issues/144)) ([6788446](https://github.com/JCIOriente/baton/commit/67884462a6d049232e65d22b145b32948cf79419))
* **implement:** stop for a user's call and log every other choice as a ruling ([#148](https://github.com/JCIOriente/baton/issues/148)) ([664b17a](https://github.com/JCIOriente/baton/commit/664b17aa1c3163e8ab59c514632343ec160704fb))
* **integrate:** list implementation rulings in the PR body ([#149](https://github.com/JCIOriente/baton/issues/149)) ([57989f7](https://github.com/JCIOriente/baton/commit/57989f7f97ebbef5c26480cee3c1d5f7245e4de8))
* **plan:** ask to approve the plan and choose how to run it ([#146](https://github.com/JCIOriente/baton/issues/146)) ([c1e42ef](https://github.com/JCIOriente/baton/commit/c1e42ef5468a0c705e25830bbceddcde8e499cdb))
* **spec:** ask the user to pick an approach before writing anything ([#147](https://github.com/JCIOriente/baton/issues/147)) ([c22ca65](https://github.com/JCIOriente/baton/commit/c22ca65a03b908361c62618536d49dc559b7978a))

## [0.6.0](https://github.com/JCIOriente/baton/compare/v0.5.0...v0.6.0) (2026-11-08)


### Features

* **status:** list named worktrees too, not only task worktrees ([#127](https://github.com/JCIOriente/baton/issues/127)) ([470de8b](https://github.com/JCIOriente/baton/commit/470de8b3af324094984f30e66f7eae9fda82a8c9))
* **worktree:** add `baton worktree clean` to remove worktrees whose PR is merged or closed ([#121](https://github.com/JCIOriente/baton/issues/121)) ([49e88c1](https://github.com/JCIOriente/baton/commit/49e88c1f652dceccc109b2b2aee0635390e60c21))


### Bug Fixes

* **cli:** print help for `--help` on any command and report option errors without a stack trace ([#120](https://github.com/JCIOriente/baton/issues/120)) ([5431902](https://github.com/JCIOriente/baton/commit/54319023708310d6f892c4e321d687f47890024c))
* **integrate:** clean up with `baton worktree clean` from the main checkout, since gh may already remove the worktree ([#128](https://github.com/JCIOriente/baton/issues/128)) ([5bbf81a](https://github.com/JCIOriente/baton/commit/5bbf81a69bb0598f2cf7e72c3e5258eaf370f352))
* **worktree:** fetch an unfetched PR head in `worktree clean` instead of giving a hint that can't work ([#126](https://github.com/JCIOriente/baton/issues/126)) ([6152e89](https://github.com/JCIOriente/baton/commit/6152e89c85ef7814864b1645907baa4378df625f))

## [0.5.0](https://github.com/JCIOriente/baton/compare/v0.4.0...v0.5.0) (2026-11-07)


### Features

* **plan:** give each task an Interfaces block and add failure-mode rows to the coverage check ([#90](https://github.com/JCIOriente/baton/issues/90)) ([4e638a1](https://github.com/JCIOriente/baton/commit/4e638a1890609aca44dd2c259e9f58bafaa06dac))
* **review:** bounded fix loop with scoped re-reviews, a 5-round cap and RED/GREEN evidence ([#92](https://github.com/JCIOriente/baton/issues/92)) ([896fa8f](https://github.com/JCIOriente/baton/commit/896fa8f13a7899c0e855475b025660a4f023d6ff))
* **review:** reviewers list what they declined to judge, and briefs are dispatched as written ([#96](https://github.com/JCIOriente/baton/issues/96)) ([0ccb77e](https://github.com/JCIOriente/baton/commit/0ccb77e8428f642b0565f0d93b435aa74766902f))
* **spec:** ask only what changes the build, and say so when one approach is the only sensible one ([#113](https://github.com/JCIOriente/baton/issues/113)) ([46377aa](https://github.com/JCIOriente/baton/commit/46377aad3752460fdf6b9bc2ecf66314af9ede8b))
* **spec:** check each spec with a fresh builder subagent before asking for approval ([#88](https://github.com/JCIOriente/baton/issues/88)) ([ea8c44b](https://github.com/JCIOriente/baton/commit/ea8c44b29bfdc5c5127a31fa5cdddee68ef4f097))


### Bug Fixes

* **deps:** apply with the normal add, handle a failed worktree audit, stop on two lockfiles per ecosystem ([#84](https://github.com/JCIOriente/baton/issues/84)) ([5c61fd4](https://github.com/JCIOriente/baton/commit/5c61fd4a17462cdd62941a096c326e7077af1504))
* **deps:** keep the baton:deps skill under its word budget ([#108](https://github.com/JCIOriente/baton/issues/108)) ([2748f37](https://github.com/JCIOriente/baton/commit/2748f376e1adc20f492e6d05f2bd2fb7afacbcd7))
* **deps:** run each package manager's own frozen install after a restore and report its result ([#105](https://github.com/JCIOriente/baton/issues/105)) ([bd61aa8](https://github.com/JCIOriente/baton/commit/bd61aa8c759c0b7dc72a9f8bc5ce008f9fe80309))
* **deps:** vet the chosen version's deprecation and peers under yarn berry ([#94](https://github.com/JCIOriente/baton/issues/94)) ([b415210](https://github.com/JCIOriente/baton/commit/b415210116539b453d9dba31060f2a00128c582c))
* **provenance:** track superpowers from the 2026-10-28 triage and report drift only for adapted files ([#98](https://github.com/JCIOriente/baton/issues/98)) ([4c7f0b4](https://github.com/JCIOriente/baton/commit/4c7f0b4eb18e1205fb22938052536730b9c4e7b0))
* **release:** don't re-run a superseded publish while the release run list fails, and judge newer versions by npm latest or a newer successful publish ([#104](https://github.com/JCIOriente/baton/issues/104)) ([11d4a4c](https://github.com/JCIOriente/baton/commit/11d4a4c524db4b6037257c28714e376a74de91cd))
* **release:** stop the release workflow comment claiming release-please holds no credentials ([#100](https://github.com/JCIOriente/baton/issues/100)) ([85aad87](https://github.com/JCIOriente/baton/commit/85aad87d5b873260e2e42569365d7774ff3efdf5))
* **release:** trimmed release workflow comment names only the kept publish target ([#79](https://github.com/JCIOriente/baton/issues/79)) ([e470af5](https://github.com/JCIOriente/baton/commit/e470af5a7ccc827ebc34bdf6adbb4ea4a8784ef9))
* **release:** wait for a newer pending publish before re-running a superseded one ([#82](https://github.com/JCIOriente/baton/issues/82)) ([791850d](https://github.com/JCIOriente/baton/commit/791850d2e219ba635480f7f799670e007cfaf413))
* **review:** count spec-ruled plan findings toward the round cap and let a fix ruling at the cap run two more rounds ([#107](https://github.com/JCIOriente/baton/issues/107)) ([3e3b842](https://github.com/JCIOriente/baton/commit/3e3b842a088d7cfec78ee2426baf70d942b1e44f))

## [0.4.0](https://github.com/JCIOriente/baton/compare/v0.3.0...v0.4.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* **hooks:** every edit happens in a linked worktree ([#57](https://github.com/JCIOriente/baton/issues/57))

### Features

* **cli:** add hooks.worktreeOnly and baton worktree add ([#55](https://github.com/JCIOriente/baton/issues/55)) ([1671b11](https://github.com/JCIOriente/baton/commit/1671b1196acd819b8138190f98fc9799b56350f5))
* **cli:** doctor recognises the old publish layout ([#69](https://github.com/JCIOriente/baton/issues/69)) ([56ae6f0](https://github.com/JCIOriente/baton/commit/56ae6f01c3a49e033cfbc319220bb01ed8db3803))
* **cli:** git worktree guard, baton hooks install, doctor and context checks ([#59](https://github.com/JCIOriente/baton/issues/59)) ([67e323c](https://github.com/JCIOriente/baton/commit/67e323c3a94e5d91db77003f40c78f2a04794038))
* **deps:** always-on context line and pointers to baton:deps ([#76](https://github.com/JCIOriente/baton/issues/76)) ([e4a3c21](https://github.com/JCIOriente/baton/commit/e4a3c21684b46e1d4674a4f048c723cbee92015a))
* **deps:** vet dependencies with baton:deps before adding or upgrading them ([#71](https://github.com/JCIOriente/baton/issues/71)) ([0b4e4bd](https://github.com/JCIOriente/baton/commit/0b4e4bdc3a7ef80890955d3fd05df62a03ae3040))
* **hooks:** every edit happens in a linked worktree ([#57](https://github.com/JCIOriente/baton/issues/57)) ([a4ccb2e](https://github.com/JCIOriente/baton/commit/a4ccb2e4a131781b05a8911c9a896524ecf548ab))
* **init:** set up the publish environment and print the trusted-publisher checklist ([#73](https://github.com/JCIOriente/baton/issues/73)) ([09d7277](https://github.com/JCIOriente/baton/commit/09d72773f729e6cdcb0fae9f8dc11873fe484c58))
* **release:** baton:release gates on a dry run and handles approval, registry checks, failures and rollback ([#66](https://github.com/JCIOriente/baton/issues/66)) ([4c1712c](https://github.com/JCIOriente/baton/commit/4c1712c1159f6eea70795908ec7020d9c1d4437a))
* **release:** one approved publish job, npm before crates, and a dry run ([#68](https://github.com/JCIOriente/baton/issues/68)) ([b1e58df](https://github.com/JCIOriente/baton/commit/b1e58df513225c03261c7e1ebf91451a4a9146f7))
* **skills:** specs, plans, backlog write-backs and lessons happen in a worktree ([#70](https://github.com/JCIOriente/baton/issues/70)) ([1e3119c](https://github.com/JCIOriente/baton/commit/1e3119cbdf4748d15610be5ad7c3ec2d7312b639))

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
