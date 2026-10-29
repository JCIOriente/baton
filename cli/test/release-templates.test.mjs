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
  for (const action of ['googleapis/release-please-action', 'actions/checkout', 'actions/setup-node', 'actions/upload-artifact', 'actions/download-artifact', 'rust-lang/crates-io-auth-action']) {
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
// Builds run code with no credentials; publish jobs hold id-token and only upload.
const BUILD_JOBS = ['build-npm', 'verify-crates'];
const PUBLISH_JOBS = ['publish-npm', 'publish-crates'];
const job = (name) => {
  const j = jobsOf(workflow())[name];
  assert.ok(j, `job ${name} exists`);
  return j;
};
const stepsOf = (j) => j.split(/^ {6}- /m).slice(1);
const SHA = /@[0-9a-f]{40} # v\d+\.\d+\.\d+/;

test('publish_jobs_are_gated_on_the_release', () => {
  for (const name of BUILD_JOBS) {
    const j = job(name);
    assert.match(j, /^ {4}needs: release-please$/m, `${name} needs release-please`);
    assert.match(j, /^ {4}if: needs\.release-please\.outputs\.release_created == 'true'$/m, `${name} runs only on a release`);
  }
  assert.match(job('publish-npm'), /^ {4}needs: \[release-please, build-npm\]$/m);
  assert.match(job('publish-npm'), /^ {4}if: needs\.release-please\.outputs\.release_created == 'true'$/m);
  assert.match(job('publish-crates'), /^ {4}needs: \[release-please, verify-crates\]$/m);
  assert.match(job('publish-crates'), /^ {4}if: needs\.release-please\.outputs\.release_created == 'true'$/m);
  // A publish job is never skipped by an earlier registry check: a re-run of only the failed job
  // would reuse a stale answer, and a skipped job reads as a failure.
  assert.doesNotMatch(workflow(), /needs\.[\w-]+\.outputs\.published/, 'no publish gate on an earlier published output');
  for (const name of PUBLISH_JOBS) assert.match(job(name), /^ {4}environment: release$/m, `${name} runs in the release environment`);
  for (const name of BUILD_JOBS) assert.doesNotMatch(job(name), /^ {4}environment:/m, `${name} has no environment`);
  // init keeps or deletes each build/publish pair together.
  const yml = workflow();
  for (const [pair, target] of [['build-npm and publish-npm', 'npm'], ['verify-crates and publish-crates', 'crates']]) {
    const marker = `  # baton:init: keep ${pair} only when release.publish has "${target}".`;
    assert.equal(yml.split('\n').filter((l) => l === marker).length, 2, `${pair} has a marker above each job`);
  }
});

test('release_please_exports_the_tagged_sha', () => {
  assert.match(job('release-please'), /^ {6}sha: \$\{\{ steps\.release\.outputs\.sha \}\}$/m);
});

test('jobs_check_out_the_released_sha_without_credentials', () => {
  for (const name of ['build-npm', 'verify-crates', 'publish-crates']) {
    assert.match(
      job(name),
      /^ {6}- uses: actions\/checkout@\S+ # v\S+\n {8}with:\n {10}ref: \$\{\{ needs\.release-please\.outputs\.sha \}\}\n {10}persist-credentials: false$/m,
      `${name} checks out the released sha, which a moved tag cannot change`,
    );
  }
});

test('publish_jobs_check_version_matches_tag', () => {
  const file = { 'build-npm': 'package.json', 'verify-crates': 'Cargo.toml' };
  for (const name of BUILD_JOBS) {
    const steps = stepsOf(job(name));
    const check = steps.findIndex((s) => /^name: Check the version matches the tag$/m.test(s));
    assert.ok(check >= 0, `${name} has the version check step`);
    const step = steps[check];
    assert.match(step, /VERSION: \$\{\{ needs\.release-please\.outputs\.version \}\}/, `${name} reads the release version`);
    assert.match(step, /TAG: \$\{\{ needs\.release-please\.outputs\.tag_name \}\}/, `${name} reads the tag`);
    assert.match(step, /\[ "\$actual" != "\$VERSION" \] \|\| \[ "\$TAG" != "v\$VERSION" \]/, `${name} requires the manifest version and tag v<version> to match`);
    assert.ok(step.includes(file[name]), `${name} reads the version from ${file[name]}`);
    assert.match(step, /exit 1/, `${name} fails on a mismatch`);
  }
  assert.match(job('build-npm'), /actual=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/, 'npm reads the manifest version');
  const crates = job('verify-crates');
  assert.match(crates, /cargo metadata --no-deps[\s\S]*manifest_path == \$manifest[\s\S]*actual=\$\(jq -r \.version <<<"\$pkg"\)/, 'crates reads the root manifest version');
  assert.match(crates, /\[ -n "\$pkg" \] \|\| \{ echo "::error::root Cargo\.toml defines no package"; exit 1; \}/, 'crates fails when the root defines no package');
  assert.match(crates, /^ {4}outputs:\n {6}name: \$\{\{ steps\.version\.outputs\.name \}\}$/m, 'verify-crates exposes the crate name');
});

test('publish_jobs_check_the_registry_right_before_publishing', () => {
  const npm = job('publish-npm');
  const crates = job('publish-crates');
  // Each publish job asks the registry itself, so a re-run of only that job sees a hand publish.
  for (const [name, j, publish] of [['publish-npm', npm, /^ {8}run: npm publish "\$\{\{ steps\.tarball\.outputs\.file \}\}" --ignore-scripts$/m], ['publish-crates', crates, /^ {8}run: cargo publish --no-verify$/m]]) {
    const steps = stepsOf(j);
    const check = steps.findIndex((s) => /^id: registry$|^name: Skip a version[\s\S]*id: registry/m.test(s) || /^ {8}id: registry$/m.test(s));
    const last = steps.findIndex((s) => publish.test(s));
    assert.ok(check >= 0, `${name} has a registry check`);
    assert.ok(last > check, `${name} checks the registry before publishing`);
    assert.match(steps[last], /^if: steps\.registry\.outputs\.published != 'true'$/m, `${name} publishes only a version the registry lacks`);
    assert.match(steps[check], /exit 1/, `${name} fails when the registry check fails`);
  }
  assert.match(npm, /npm view "\$NAME@\$VERSION" version/, 'npm checks the registry');
  assert.match(npm, /if \[ "\$found" = "\$VERSION" \]; then\n(?:.*\n)*? {12}echo "published=true" >> "\$GITHUB_OUTPUT"\n {10}else\n {12}echo "published=false"/, 'npm skips only an exact version match');
  // Only E404 means "not published"; any other npm failure fails the job.
  assert.match(
    npm,
    /elif grep -q E404 "\$RUNNER_TEMP\/npm-view\.err"; then\n {12}found=""\n {10}else\n(?: {12}.*\n)*? {12}exit 1\n {10}fi/,
    'a non-E404 npm error exits 1',
  );
  assert.doesNotMatch(npm, /npm view[^\n]*\|\| true/, 'npm view errors are not swallowed');
  assert.doesNotMatch(npm, /npm view[^\n]*2>\/dev\/null/, 'npm view keeps stderr');
  assert.match(crates, /-H "User-Agent: /, 'crates.io API needs a User-Agent');
  assert.match(crates, /https:\/\/crates\.io\/api\/v1\/crates\/\$NAME\/\$VERSION/);
  assert.match(crates, /200\) echo "[^\n]*\n\s+echo "published=true" >> "\$GITHUB_OUTPUT" ;;/, 'crates 200 means published');
  assert.match(crates, /404\) echo "published=false" >> "\$GITHUB_OUTPUT" ;;/, 'crates 404 means not published');
  assert.match(crates, /\*\) echo "::error::crates\.io returned HTTP/, 'crates fails on any other status');
  for (const name of BUILD_JOBS) assert.doesNotMatch(job(name), /npm view|crates\.io\/api/, `${name} does not gate publishing`);
});

test('all_publish_related_jobs_fail_on_pipe_errors', () => {
  for (const name of [...BUILD_JOBS, ...PUBLISH_JOBS]) {
    assert.match(job(name), /^ {4}defaults:\n {6}run:\n {8}shell: bash$/m, `${name} runs steps with bash -eo pipefail`);
  }
});

test('npm_builds_without_credentials_and_uploads_the_tarball', () => {
  const steps = stepsOf(job('build-npm'));
  const at = (re) => {
    const i = steps.findIndex((s) => re.test(s));
    assert.ok(i >= 0, `step matching ${re}`);
    return i;
  };
  const install = at(/^ {8}run: npm ci$/m);
  const build = at(/^(?: {8})?run: npm run build --if-present$/m);
  const pack = at(/^(?: {8})?run: npm pack --pack-destination "\$RUNNER_TEMP\/pack"$/m);
  const upload = at(/uses: actions\/upload-artifact@/);
  assert.ok(install < build && build < pack && pack < upload, 'install, build, pack, then upload');
  assert.match(steps[install], /^if: hashFiles\('package-lock\.json'\) != ''$/m);
  assert.match(job('build-npm'), /# [^\n]*pnpm[^\n]*replace/i, 'comment tells other package managers to replace the step');
  assert.match(steps[upload], /^uses: actions\/upload-artifact@/m);
  assert.match(steps[upload], /name: npm-package/);
  assert.match(steps[upload], /if-no-files-found: error/);
  // A failed publish is retried with "Re-run failed jobs" within the retention window.
  assert.match(steps[upload], /retention-days: 7$/m);
});

test('publish_npm_publishes_only_the_prepared_tarball', () => {
  const j = job('publish-npm');
  assert.doesNotMatch(j, /npm (ci|install)|actions\/checkout/, 'no install and no source checkout in the job with id-token');
  assert.match(j, /actions\/download-artifact@/);
  assert.match(j, /name: npm-package/);
  assert.match(j, /tar -xOf "\$1" package\/package\.json/, 'reads the tarball package.json');
  assert.match(j, /if \[ "\$actual" != "\$VERSION" \]; then\n {12}echo "::error::tarball version[^\n]*\n {12}exit 1/, 'fails when the tarball version differs');
  assert.match(j, /npm publish "\$\{\{ steps\.tarball\.outputs\.file \}\}" --ignore-scripts$/m, 'publishes the tarball without lifecycle scripts');
  assert.ok(j.indexOf('tar -xOf') < j.indexOf('npm publish'), 'checks the tarball before publishing');
  assert.doesNotMatch(j, /npm run|npm pack/, 'no build code runs here');
});

test('crates_build_runs_without_credentials', () => {
  const verify = job('verify-crates');
  assert.match(verify, /^ {6}- run: cargo package$/m, 'verify-crates compiles the package');
  assert.doesNotMatch(verify, /CARGO_REGISTRY_TOKEN|crates-io-auth-action/, 'no token while building');
  const publish = job('publish-crates');
  assert.match(publish, /run: cargo publish --no-verify$/m, 'publish does not rebuild');
  assert.doesNotMatch(publish, /cargo (package|build|test)/, 'no build in the job with id-token');
});

test('publish_jobs_use_trusted_publishing', () => {
  const yml = workflow();
  assert.doesNotMatch(yml, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.CARGO_REGISTRY_TOKEN/, 'no stored registry token');
  for (const name of ['build-npm', 'publish-npm']) {
    assert.match(job(name), /^ {6}- uses: actions\/setup-node@\S+ # v\S+\n {8}with:\n(?: {10}.*\n)*? {10}registry-url: https:\/\/registry\.npmjs\.org$/m, `${name} sets the registry`);
  }
  const crates = job('publish-crates');
  assert.match(crates, /^ {8}uses: rust-lang\/crates-io-auth-action@/m);
  assert.match(crates, /^ {10}CARGO_REGISTRY_TOKEN: \$\{\{ steps\.auth\.outputs\.token \}\}$/m);
  assert.equal(yml.split('CARGO_REGISTRY_TOKEN').length - 1, 1, 'the token appears in one step only');
});

test('artifact_actions_are_pinned_to_sha', () => {
  assert.match(job('build-npm'), new RegExp(`uses: actions/upload-artifact${SHA.source}`));
  assert.match(job('publish-npm'), new RegExp(`uses: actions/download-artifact${SHA.source}`));
});

test('id_token_only_on_publish_jobs', () => {
  const jobs = jobsOf(workflow());
  for (const [name, text] of Object.entries(jobs)) {
    const j = text.replace(/^\s*#.*$/gm, ''); // comments may mention id-token
    if (PUBLISH_JOBS.includes(name)) {
      assert.match(j, /^ {4}permissions:\n {6}contents: read\n {6}id-token: write$/m, `${name} has contents read and id-token write`);
    } else {
      assert.doesNotMatch(j, /id-token/, `${name} has no id-token`);
      assert.doesNotMatch(j, /write-all/, `${name} has no write-all permissions`);
    }
  }
  for (const name of BUILD_JOBS) assert.match(jobs[name], /^ {4}permissions:\n {6}contents: read\n {4}\S/m, `${name} only reads contents`);
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
