// The files baton:init writes when a repo enables releases (templates/release/).
// YAML is checked with plain text matching: the CLI has no dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const dir = new URL('../../templates/release/', import.meta.url).pathname;
const read = (name) => readFileSync(join(dir, name), 'utf8');
const workflow = () => read('release.yml');

test('release_templates_are_valid_json', () => {
  const config = JSON.parse(read('release-please-config.json'));
  assert.deepEqual(Object.keys(config.packages), ['.'], 'one package at the root');
  const pkg = config.packages['.'];
  assert.equal(pkg['bump-minor-pre-major'], true);
  assert.ok(Array.isArray(pkg['extra-files']), 'extra-files slot');
  assert.deepEqual(JSON.parse(read('.release-please-manifest.json')), { '.': '<version>' });
});

test('release_config_tags_are_v_version', () => {
  const pkg = JSON.parse(read('release-please-config.json')).packages['.'];
  assert.equal(pkg['include-component-in-tag'], false);
  assert.equal(pkg['include-v-in-tag'], true);
});

test('release_workflow_uses_release_please_token', () => {
  const yml = workflow();
  assert.match(yml, /^ +token: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \}\}$/m);
  assert.match(yml, /^ {2}workflow_dispatch:/m, 'runs on workflow_dispatch');
  assert.match(yml, /^ {2}push:\n {4}branches: \["<base-branch>"\]/m, 'runs on push to the base branch placeholder');
  assert.match(yml, /^ {10}target-branch: "<base-branch>"$/m);
  assert.match(yml, /^permissions: \{\}$/m, 'top-level permissions are empty');
  assert.match(yml, /^concurrency:\n {2}group: release\n {2}cancel-in-progress: false$/m);
  assert.match(yml, /^ {2}release-please:$/m, 'release-please job');
  assert.match(yml, /^ {2}release-please:\n(?: {4}.*\n)*? {4}environment: release$/m, 'token is an environment secret');
  assert.match(yml, /^ {6}- id: release\n {8}uses: googleapis\/release-please-action@/m, 'outputs come from the release-please step');
  for (const out of ['release_created', 'tag_name', 'version']) {
    assert.match(yml, new RegExp(`^ {6}${out}: \\$\\{\\{ steps\\.release\\.outputs\\.${out} \\}\\}$`, 'm'), `output ${out}`);
  }
  // Every job declares its own permissions.
  const jobs = yml.split(/^jobs:$/m)[1].split(/^ {2}(?=[\w-]+:$)/m).filter((j) => j.trim() && !j.trim().startsWith('#'));
  assert.ok(jobs.length > 0);
  for (const job of jobs) assert.match(job, /^ {4}permissions:/m, `job ${job.split(':')[0]} declares permissions`);
});

test('release_workflow_pins_actions_to_sha', () => {
  const uses = [...workflow().matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
  assert.ok(uses.length > 0, 'workflow uses at least one action');
  for (const [, ref, rest] of uses) {
    assert.match(ref, /^[\w.-]+\/[\w.\/-]+@[0-9a-f]{40}$/, `${ref} is pinned to a full commit SHA`);
    assert.match(rest, /^\s+# v\d+\.\d+\.\d+$/, `${ref} names the released version in a comment`);
  }
  for (const action of ['googleapis/release-please-action', 'actions/checkout', 'actions/setup-node', 'rust-lang/crates-io-auth-action']) {
    assert.ok(uses.some(([, ref]) => ref.startsWith(`${action}@`)), `${action} is used`);
  }
});

// Each job's text, keyed by job id. A comment between jobs ends up in the job above it.
const jobsOf = (yml) =>
  Object.fromEntries(
    yml
      .split(/^jobs:$/m)[1]
      .split(/^ {2}(?=[\w-]+:$)/m)
      .filter((j) => j.trim() && !j.trim().startsWith('#'))
      .map((j) => [j.split(':')[0], j]),
  );
const PUBLISH_JOBS = ['publish-npm', 'publish-crates'];
const publishJobs = () => {
  const jobs = jobsOf(workflow());
  return PUBLISH_JOBS.map((name) => {
    assert.ok(jobs[name], `job ${name} exists`);
    return [name, jobs[name]];
  });
};

test('publish_jobs_need_release_created', () => {
  for (const [name, job] of publishJobs()) {
    assert.match(job, /^ {4}needs: release-please$/m, `${name} needs release-please`);
    assert.match(job, /^ {4}if: needs\.release-please\.outputs\.release_created == 'true'$/m, `${name} runs only on a release`);
    assert.match(job, /^ {4}environment: release$/m, `${name} runs in the release environment`);
  }
  // init keeps each job only when its target is in release.publish.
  const yml = workflow();
  assert.match(yml, /^ {2}# baton:init: keep publish-npm only when release\.publish has "npm"\.$/m);
  assert.match(yml, /^ {2}# baton:init: keep publish-crates only when release\.publish has "crates"\.$/m);
});

test('publish_jobs_check_out_the_tag', () => {
  for (const [name, job] of publishJobs()) {
    assert.match(
      job,
      /^ {6}- uses: actions\/checkout@\S+ # v\S+\n {8}with:\n {10}ref: \$\{\{ needs\.release-please\.outputs\.tag_name \}\}$/m,
      `${name} checks out tag_name`,
    );
  }
});

test('publish_jobs_check_version_matches_tag', () => {
  const file = { 'publish-npm': 'package.json', 'publish-crates': 'Cargo.toml' };
  for (const [name, job] of publishJobs()) {
    const steps = job.split(/^ {6}- /m).slice(1);
    const check = steps.findIndex((s) => /^name: Check the version matches the tag$/m.test(s));
    const publish = steps.findIndex((s) => /^ {8}run: (npm|cargo) publish$/m.test(s));
    assert.ok(check >= 0, `${name} has the version check step`);
    assert.ok(publish > check, `${name} checks the version before publishing`);
    const step = steps[check];
    assert.match(step, /VERSION: \$\{\{ needs\.release-please\.outputs\.version \}\}/, `${name} reads the release version`);
    assert.match(step, /TAG: \$\{\{ needs\.release-please\.outputs\.tag_name \}\}/, `${name} reads the tag`);
    assert.match(step, /\[ "\$actual" != "\$VERSION" \] \|\| \[ "\$TAG" != "v\$VERSION" \]/, `${name} requires the manifest version and tag v<version> to match`);
    assert.ok(step.includes(file[name]), `${name} reads the version from ${file[name]}`);
    assert.match(step, /exit 1/, `${name} fails on a mismatch`);
    // Publishing is skipped when the registry already has the version.
    assert.match(steps[publish], /^if: steps\.registry\.outputs\.published != 'true'$/m, `${name} skips a published version`);
  }
  const [[, npm], [, crates]] = publishJobs();
  assert.match(npm, /actual=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/, 'npm reads the manifest version');
  assert.match(crates, /cargo metadata --no-deps[\s\S]*manifest_path == \$manifest[\s\S]*actual=\$\(jq -r \.version <<<"\$pkg"\)/, 'crates reads the root manifest version');
  assert.match(crates, /\[ -n "\$pkg" \] \|\| \{ echo "::error::root Cargo\.toml defines no package"; exit 1; \}/, 'crates fails when the root defines no package');
  assert.match(npm, /npm view "\$NAME@\$VERSION" version/, 'npm checks the registry');
  assert.match(crates, /-H "User-Agent: /, 'crates.io API needs a User-Agent');
  assert.match(crates, /https:\/\/crates\.io\/api\/v1\/crates\/\$NAME\/\$VERSION/);
});

test('publish_jobs_skip_a_version_the_registry_has', () => {
  const [[, npm], [, crates]] = publishJobs();
  assert.match(npm, /if \[ "\$found" = "\$VERSION" \]; then\n(?:.*\n)*? {12}echo "published=true" >> "\$GITHUB_OUTPUT"\n {10}else\n {12}echo "published=false"/, 'npm skips only an exact version match');
  // Only E404 means "not published"; any other npm failure fails the job.
  assert.doesNotMatch(npm, /npm view[^\n]*\|\| true/, 'npm view errors are not swallowed');
  assert.doesNotMatch(npm, /npm view[^\n]*2>\/dev\/null/, 'npm view keeps stderr');
  assert.match(npm, /grep -q E404/, 'npm treats only E404 as not published');
  assert.match(npm, /exit 1/);
  assert.match(crates, /200\) echo "[^\n]*\n\s+echo "published=true" >> "\$GITHUB_OUTPUT" ;;/, 'crates 200 means published');
  assert.match(crates, /404\) echo "published=false" >> "\$GITHUB_OUTPUT" ;;/, 'crates 404 means not published');
  assert.match(crates, /\*\) echo "::error::crates\.io returned HTTP/, 'crates fails on any other status');
});

test('publish_jobs_fail_on_pipe_errors', () => {
  for (const [name, job] of publishJobs()) {
    assert.match(job, /^ {4}defaults:\n {6}run:\n {8}shell: bash$/m, `${name} runs steps with bash -eo pipefail`);
  }
});

test('npm_installs_only_with_a_lockfile_before_publishing', () => {
  const [[, npm]] = publishJobs();
  const steps = npm.split(/^ {6}- /m).slice(1);
  const install = steps.findIndex((s) => /^ {8}run: npm ci$/m.test(s));
  const publish = steps.findIndex((s) => /^ {8}run: npm publish$/m.test(s));
  assert.ok(install >= 0, 'npm job has an install step');
  assert.ok(install < publish, 'install comes before publish');
  assert.match(steps[install], /^if: steps\.registry\.outputs\.published != 'true' && hashFiles\('package-lock\.json'\) != ''$/m);
  assert.match(npm, /# [^\n]*pnpm[^\n]*replace/i, 'comment tells other package managers to replace the step');
});

test('publish_jobs_use_trusted_publishing', () => {
  const yml = workflow();
  assert.doesNotMatch(yml, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.CARGO_REGISTRY_TOKEN/, 'no stored registry token');
  const [[, npm], [, crates]] = publishJobs();
  assert.match(npm, /^ {6}- uses: actions\/setup-node@\S+ # v\S+\n {8}with:\n(?: {10}.*\n)*? {10}registry-url: https:\/\/registry\.npmjs\.org$/m);
  assert.match(crates, /^ {8}uses: rust-lang\/crates-io-auth-action@/m);
  assert.match(crates, /^ {10}CARGO_REGISTRY_TOKEN: \$\{\{ steps\.auth\.outputs\.token \}\}$/m);
});

test('id_token_only_on_publish_jobs', () => {
  const jobs = jobsOf(workflow());
  for (const [name, job] of Object.entries(jobs)) {
    if (PUBLISH_JOBS.includes(name)) {
      assert.match(job, /^ {4}permissions:\n {6}contents: read\n {6}id-token: write$/m, `${name} has contents read and id-token write`);
    } else {
      assert.doesNotMatch(job, /id-token/, `${name} has no id-token`);
      assert.doesNotMatch(job, /write-all/, `${name} has no write-all permissions`);
    }
  }
  assert.doesNotMatch(workflow().split(/^jobs:$/m)[0], /id-token|write-all/, 'no workflow-level id-token or write-all');
});

test('release_templates_are_only_the_three_files', () => {
  // No CHANGELOG template: release-please creates CHANGELOG.md on the first release.
  assert.deepEqual(readdirSync(dir).sort(), ['.release-please-manifest.json', 'release-please-config.json', 'release.yml']);
});

const hasActionlint = spawnSync('actionlint', ['-version']).status === 0;
test('release_workflow_passes_actionlint', { skip: !hasActionlint && 'actionlint is not on PATH' }, () => {
  const res = spawnSync('actionlint', [join(dir, 'release.yml')], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});
