// The files baton:init writes when a repo enables releases (templates/release/).
// YAML is checked with plain text matching: the CLI has no dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
// Builds run code with no credentials; the publish job holds id-token and only uploads.
const BUILD_JOBS = ['build-npm', 'verify-crates'];
const DRY_RUN_JOBS = ['dry-run-npm'];
const PUBLISH_JOBS = ['publish'];
const job = (name) => {
  const j = jobsOf(workflow())[name];
  assert.ok(j, `job ${name} exists`);
  return j;
};
const stepsOf = (j) => j.split(/^ {6}- /m).slice(1);
const SHA = /@[0-9a-f]{40} # v\d+\.\d+\.\d+/;
const ifOf = (j) => j.match(/^ {4}if: (.*)$/m)?.[1];

// baton:init keeps or deletes each marked job or step by release.publish. A marker opens the run
// of comment lines directly above the job key or step it marks.
const MARKER = /^( *)# baton:init: keep this (job|step) only when release\.publish has "(npm|crates)"$/;
const indentOf = (line) => line.match(/^ */)[0].length;
const markerAbove = (lines, i) => {
  const indent = indentOf(lines[i]);
  let k = i - 1;
  while (k >= 0 && indentOf(lines[k]) === indent && lines[k].trim().startsWith('#') && !MARKER.test(lines[k])) k--;
  const m = k >= 0 && indentOf(lines[k]) === indent ? lines[k].match(MARKER) : null;
  return m ? { kind: m[2], target: m[3] } : null;
};
// The steps of a job with the target their marker names (null when unmarked).
const markedSteps = (j) => {
  const lines = j.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^ {6}- /.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && indentOf(lines[end]) > 6 && lines[end].trim()) end++;
    const marker = markerAbove(lines, i);
    out.push({ target: marker?.kind === 'step' ? marker.target : null, text: lines.slice(i, end).join('\n') });
  }
  return out;
};
const jobMarker = (yml, name) => {
  const lines = yml.split('\n');
  const i = lines.indexOf(`  ${name}:`);
  assert.ok(i >= 0, `job ${name} exists`);
  const marker = markerAbove(lines, i);
  return marker?.kind === 'job' ? marker.target : null;
};
// What baton:init leaves for a repo that publishes only `keep`: the other target's marked blocks
// deleted, and the deleted jobs removed from every `needs` list.
const trimTo = (yml, keep) => {
  const lines = yml.split('\n');
  const out = [];
  const dropped = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER);
    if (!m || m[3] === keep) {
      out.push(lines[i]);
      continue;
    }
    const indent = m[1].length;
    let k = i + 1;
    while (k < lines.length && indentOf(lines[k]) === indent && lines[k].trim().startsWith('#')) k++;
    if (m[2] === 'job') dropped.push(lines[k].trim().replace(/:$/, ''));
    k++;
    while (k < lines.length && lines[k].trim() && indentOf(lines[k]) > indent) k++;
    i = k - 1;
  }
  return out
    .join('\n')
    .replace(/^( {4}needs: \[)(.*)\]$/gm, (_, head, list) => `${head}${list.split(', ').filter((n) => !dropped.includes(n)).join(', ')}]`);
};

test('dry_run_input_defaults_false_and_skips_release_please', () => {
  const yml = workflow();
  const input = yml.match(/^ {2}workflow_dispatch:\n {4}inputs:\n(?: {6}#.*\n)* {6}dry_run:\n((?: {8}.*\n)+)/m);
  assert.ok(input, 'workflow_dispatch has a dry_run input');
  assert.match(input[1], /^ {8}type: boolean$/m);
  assert.match(input[1], /^ {8}default: false$/m);
  assert.match(input[1], /^ {8}description: \S/m);
  assert.equal(ifOf(job('release-please')), '${{ !inputs.dry_run }}', 'release-please is skipped on a dry run');
});

test('baton_release_workflow_matches_the_template_release_please_job', () => {
  const own = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const releasePlease = (yml) => jobsOf(yml)['release-please'].replace(/(?:\n *(?:#.*)?)+$/, '');
  const trigger = (yml) => yml.split(/^jobs:$/m)[0];
  const template = workflow().replaceAll('<base-branch>', 'main');
  assert.equal(releasePlease(own), releasePlease(template));
  assert.equal(trigger(own), trigger(template), 'same triggers, dry_run input, permissions and concurrency');
});

test('single_publish_job_needs_every_build_and_verify_job', () => {
  const jobs = jobsOf(workflow());
  assert.deepEqual(Object.keys(jobs).sort(), ['build-npm', 'dry-run-npm', 'publish', 'release-please', 'verify-crates']);
  assert.match(jobs.publish, /^ {4}needs: \[release-please, build-npm, verify-crates\]$/m, 'needs on one line');
  assert.equal(ifOf(jobs.publish), "needs.release-please.outputs.release_created == 'true'", 'publishes only a created release');
  assert.match(jobs.publish, /^ {4}environment: publish$/m);
  for (const name of BUILD_JOBS) assert.match(jobs[name], /^ {4}needs: release-please$/m, `${name} needs release-please`);
  assert.match(jobs['dry-run-npm'], /^ {4}needs: build-npm$/m);
  // A publish step is never skipped by an earlier job's registry check: a re-run of only the
  // failed job would reuse a stale answer.
  assert.doesNotMatch(workflow(), /needs\.[\w-]+\.outputs\.published/, 'no publish gate on an earlier published output');
  // Environments: release-please alone holds the token; publish alone waits for approval.
  for (const [name, text] of Object.entries(jobs)) {
    const env = text.match(/^ {4}environment: (\S+)$/m)?.[1];
    if (name === 'release-please') assert.equal(env, 'release');
    else if (name === 'publish') assert.equal(env, 'publish');
    else assert.equal(env, undefined, `${name} has no environment`);
  }
  // Markers follow the Contract: every job but release-please and publish is one target's.
  const yml = workflow();
  assert.equal(jobMarker(yml, 'build-npm'), 'npm');
  assert.equal(jobMarker(yml, 'dry-run-npm'), 'npm');
  assert.equal(jobMarker(yml, 'verify-crates'), 'crates');
  assert.equal(jobMarker(yml, 'release-please'), null);
  assert.equal(jobMarker(yml, 'publish'), null, 'init deletes publish only when no target step is left');
  const steps = markedSteps(jobs.publish);
  for (const step of steps) assert.ok(step.target, `publish step is marked: ${step.text.split('\n')[0]}`);
  const named = (re) => {
    const step = steps.find((s) => re.test(s.text));
    assert.ok(step, `publish has a step matching ${re}`);
    return step;
  };
  assert.equal(named(/uses: actions\/setup-node@/).target, 'npm');
  assert.equal(named(/name: Check npm supports trusted publishing/).target, 'npm');
  assert.equal(named(/uses: actions\/download-artifact@/).target, 'npm');
  assert.equal(named(/id: tarball/).target, 'npm');
  assert.equal(named(/id: npm-registry/).target, 'npm');
  assert.equal(named(/name: Publish to npm$/m).target, 'npm');
  assert.equal(named(/uses: actions\/checkout@/).target, 'crates');
  assert.equal(named(/name: Check the crate version matches the tag/).target, 'crates');
  assert.equal(named(/id: crates-registry/).target, 'crates');
  assert.equal(named(/uses: rust-lang\/crates-io-auth-action@/).target, 'crates');
  assert.equal(named(/name: Publish to crates\.io$/m).target, 'crates');
  // The old marker form, and the old jobs, are gone.
  assert.doesNotMatch(yml, /publish-npm|publish-crates/);
  assert.equal(yml.split('\n').filter((l) => l.includes('baton:init: keep') && !MARKER.test(l)).length, 0, 'every marker follows the Contract');
});

const publishSteps = () => markedSteps(job('publish'));
const indexOfStep = (steps, re) => {
  const i = steps.findIndex((s) => re.test(s.text));
  assert.ok(i >= 0, `step matching ${re}`);
  return i;
};

test('publish_checks_everything_before_publishing_anything', () => {
  const steps = publishSteps();
  const firstPublish = Math.min(indexOfStep(steps, /name: Publish to npm$/m), indexOfStep(steps, /name: Publish to crates\.io$/m));
  for (const check of [/name: Check npm supports trusted publishing/, /id: tarball/, /name: Check the crate version matches the tag/, /id: npm-registry/, /id: crates-registry/]) {
    assert.ok(indexOfStep(steps, check) < firstPublish, `${check} runs before any publish`);
  }
  // A crates.io trusted-publisher mismatch fails before npm gets anything.
  assert.ok(indexOfStep(steps, /crates-io-auth-action/) < firstPublish, 'crates.io auth before any publish');
});

test('npm_publishes_before_crates', () => {
  const steps = publishSteps();
  assert.ok(indexOfStep(steps, /name: Publish to npm$/m) < indexOfStep(steps, /name: Publish to crates\.io$/m));
});

test('dry_run_jobs_have_no_id_token_or_environment', () => {
  for (const name of [...BUILD_JOBS, ...DRY_RUN_JOBS]) {
    const j = job(name).replace(/^\s*#.*$/gm, '');
    assert.match(j, /^ {4}permissions:\n {6}contents: read\n {4}\S/m, `${name} only reads contents`);
    assert.doesNotMatch(j, /id-token|environment:|secrets\./, `${name} has no id-token, environment or secret`);
  }
  const dry = job('dry-run-npm');
  assert.equal(ifOf(dry), "${{ !cancelled() && inputs.dry_run && needs.build-npm.result == 'success' }}");
  assert.match(dry, /uses: actions\/download-artifact@/);
  assert.match(dry, /tar -xOf "\$1" package\/package\.json/, 'same tarball checks as publish');
  assert.match(dry, /^ {10}npm publish "\$1" --dry-run --ignore-scripts$/m);
  assert.doesNotMatch(dry.replace('npm publish "$1" --dry-run --ignore-scripts', ''), /npm publish/, 'only the dry-run publish');
  // The tarball check is the same script in both jobs.
  const tarball = (j) => stepsOf(j).find((s) => /id: tarball/.test(s)).split(/^ {8}run: \|$/m)[1].split('\n').filter((l) => indentOf(l) >= 10).join('\n');
  assert.equal(tarball(dry), tarball(job('publish')));
  const registry = (j) => stepsOf(j).find((s) => /id: npm-registry/.test(s)).split(/^ {8}run: \|$/m)[1].split('\n').filter((l) => indentOf(l) >= 10).join('\n');
  assert.ok(registry(dry).includes('npm view'), 'the registry script is captured');
  assert.equal(registry(dry), registry(job('publish')), 'same registry skip check as publish');
  // npm refuses a dry-run publish of a version it already has; the skip is reported, not silent.
  const report = stepsOf(dry).find((s) => /^ {8}if: steps\.npm-registry\.outputs\.published == 'true'$/m.test(s));
  assert.ok(report, 'a step reports the skipped dry-run publish');
  assert.match(report, /echo "::notice::npm dry-run publish skipped/);
  assert.match(report, />> "\$GITHUB_STEP_SUMMARY"/);
});

test('verify_crates_dry_run_publish_only_on_dry_run', () => {
  const steps = stepsOf(job('verify-crates'));
  const compile = steps.filter((s) => /^ +cargo (package|publish)/m.test(s));
  assert.equal(compile.length, 1, 'one step compiles the crate');
  assert.match(compile[0], /^ {10}DRY_RUN: \$\{\{ inputs\.dry_run \}\}$/m);
  assert.match(
    compile[0],
    /^ {10}if \[ "\$DRY_RUN" = true \]; then\n {12}cargo publish --dry-run "\$\{locked\[@\]\}"\n {10}else\n {12}cargo package "\$\{locked\[@\]\}"\n {10}fi$/m,
    'cargo publish --dry-run replaces cargo package only on a dry run',
  );
});

// --locked only when Cargo.lock is tracked, the same way wherever cargo packages the crate.
const LOCKED = /^ {10}locked=\(\)\n {10}if git ls-files --error-unmatch Cargo\.lock >\/dev\/null 2>&1; then locked=\(--locked\); fi$/m;
test('cargo_uses_locked_when_cargo_lock_is_tracked', () => {
  for (const name of ['verify-crates', 'publish']) {
    const cargoSteps = stepsOf(job(name)).filter((s) => /^ +cargo (package|publish)/m.test(s));
    assert.equal(cargoSteps.length, 1, `${name} packages the crate in one step`);
    for (const step of cargoSteps) {
      assert.match(step, LOCKED, `${name}: ${step.split('\n')[0]}`);
      assert.match(step, /cargo (package|publish)[^\n]* "\$\{locked\[@\]\}"$/m);
    }
  }
});

test('dry_run_path_ifs_use_not_cancelled', () => {
  for (const name of BUILD_JOBS) {
    assert.equal(ifOf(job(name)), "${{ !cancelled() && (needs.release-please.outputs.release_created == 'true' || inputs.dry_run) }}", name);
  }
  assert.match(ifOf(job('dry-run-npm')), /^\$\{\{ !cancelled\(\) && /);
});

test('publish_if_has_no_status_function', () => {
  const cond = ifOf(job('publish'));
  assert.doesNotMatch(cond, /success\(\)|failure\(\)|always\(\)|cancelled\(\)/, 'implicit success() needs every job to succeed');
  assert.doesNotMatch(cond, /build-npm|verify-crates/, 'names no build or verify job, so init can delete either');
});

test('concurrency_is_per_job_and_dry_runs_never_join_release', () => {
  // Per-workflow concurrency would let a dry run cancel a pending release run (one pending run
  // per group), and a publish waiting for approval would hold up release-please for every push.
  assert.doesNotMatch(workflow(), /^concurrency:/m, 'no workflow-level concurrency');
  const groups = Object.fromEntries(
    Object.entries(jobsOf(workflow())).map(([name, text]) => [name, text.match(/^ {4}concurrency:\n {6}group: (.*)\n {6}cancel-in-progress: false$/m)?.[1]]),
  );
  assert.deepEqual(groups, {
    'release-please': "${{ inputs.dry_run && 'release-dry-run' || 'release' }}",
    'build-npm': undefined,
    'verify-crates': undefined,
    'dry-run-npm': undefined,
    publish: "${{ needs.release-please.outputs.release_created == 'true' && 'publish' || format('publish-skipped-{0}', github.run_id) }}",
  });
});

test('release_please_exports_the_tagged_sha', () => {
  assert.match(job('release-please'), /^ {6}sha: \$\{\{ steps\.release\.outputs\.sha \}\}$/m);
});

test('jobs_check_out_the_released_sha_without_credentials', () => {
  const checkout = (ref) => new RegExp(`^ {6}- uses: actions\\/checkout@\\S+ # v\\S+\\n {8}with:\\n {10}ref: ${ref}\\n {10}persist-credentials: false$`, 'm');
  for (const name of BUILD_JOBS) {
    // A dry run has no release: it checks the dispatched commit.
    assert.match(job(name), checkout('\\$\\{\\{ inputs\\.dry_run && github\\.sha \\|\\| needs\\.release-please\\.outputs\\.sha \\}\\}'), name);
  }
  assert.match(job('publish'), checkout('\\$\\{\\{ needs\\.release-please\\.outputs\\.sha \\}\\}'), 'publish checks out the released sha, which a moved tag cannot change');
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
    assert.match(step, /DRY_RUN: \$\{\{ inputs\.dry_run \}\}/, `${name} knows when it is a dry run`);
    assert.match(step, /if \[ "\$DRY_RUN" = true \]; then\n {12}VERSION=\$\([^\n]*\.release-please-manifest\.json[^\n]*\)\n {12}TAG="v\$VERSION"\n {10}fi/, `${name} compares with the manifest on a dry run`);
    assert.match(step, /\[ "\$actual" != "\$VERSION" \] \|\| \[ "\$TAG" != "v\$VERSION" \]/, `${name} requires the manifest version and tag v<version> to match`);
    assert.ok(step.includes(file[name]), `${name} reads the version from ${file[name]}`);
    assert.match(step, /exit 1/, `${name} fails on a mismatch`);
  }
  assert.match(job('build-npm'), /actual=\$\(node -p "require\('\.\/package\.json'\)\.version"\)/, 'npm reads the manifest version');
  assert.match(job('build-npm'), /^ {4}outputs:\n {6}version: \$\{\{ steps\.version\.outputs\.version \}\}$/m, 'build-npm exposes the checked version');
  const crates = job('verify-crates');
  assert.match(crates, /cargo metadata --no-deps[\s\S]*manifest_path == \$manifest[\s\S]*actual=\$\(jq -r \.version <<<"\$pkg"\)/, 'crates reads the root manifest version');
  assert.match(crates, /\[ -n "\$pkg" \] \|\| \{ echo "::error::root Cargo\.toml defines no package"; exit 1; \}/, 'crates fails when the root defines no package');
  assert.match(crates, /^ {4}outputs:\n {6}name: \$\{\{ steps\.version\.outputs\.name \}\}$/m, 'verify-crates exposes the crate name');
  // publish checks the crate it is about to upload, too.
  const publishCrate = stepsOf(job('publish')).find((s) => /^name: Check the crate version matches the tag$/m.test(s));
  assert.match(publishCrate, /\[ "\$actual" != "\$VERSION" \] \|\| \[ "\$TAG" != "v\$VERSION" \]/);
  assert.doesNotMatch(publishCrate, /DRY_RUN/, 'publish never runs on a dry run');
});

test('publish_jobs_check_the_registry_right_before_publishing', () => {
  const j = job('publish');
  const steps = stepsOf(j);
  // The publish job asks the registry itself, so a re-run of only that job sees a hand publish.
  for (const [target, id, publish] of [['npm', 'npm-registry', /^ {8}run: \|\n(?: {10}.*\n)*? {10}npm publish "\$1" --ignore-scripts$/m], ['crates', 'crates-registry', /^ {8}run: \|\n(?: {10}.*\n)*? {10}cargo publish --no-verify "\$\{locked\[@\]\}"$/m]]) {
    const check = steps.findIndex((s) => new RegExp(`^ {8}id: ${id}$`, 'm').test(s));
    const last = steps.findIndex((s) => publish.test(s));
    assert.ok(check >= 0, `${target} has a registry check`);
    assert.ok(last > check, `${target} checks the registry before publishing`);
    assert.match(steps[last], new RegExp(`^ {8}if: steps\\.${id}\\.outputs\\.published != 'true'$`, 'm'), `${target} publishes only a version the registry lacks`);
    assert.match(steps[check], /exit 1/, `${target} fails when the registry check fails`);
  }
  const npm = steps.find((s) => /id: npm-registry/.test(s));
  const crates = steps.find((s) => /id: crates-registry/.test(s));
  assert.match(npm, /npm view "\$NAME@\$VERSION" version/, 'npm checks the registry');
  assert.match(npm, /if \[ "\$found" = "\$VERSION" \]; then\n(?:.*\n)*? {12}echo "published=true" >> "\$GITHUB_OUTPUT"\n {10}else\n {12}echo "published=false"/, 'npm skips only an exact version match');
  // Only E404 means "not published"; any other npm failure fails the job.
  assert.match(
    npm,
    /elif grep -q E404 "\$RUNNER_TEMP\/npm-view\.err"; then\n {12}found=""\n {10}else\n(?: {12}.*\n)*? {12}exit 1\n {10}fi/,
    'a non-E404 npm error exits 1',
  );
  assert.doesNotMatch(j, /npm view[^\n]*\|\| true/, 'npm view errors are not swallowed');
  assert.doesNotMatch(j, /npm view[^\n]*2>\/dev\/null/, 'npm view keeps stderr');
  assert.match(crates, /-H "User-Agent: /, 'crates.io API needs a User-Agent');
  assert.match(crates, /https:\/\/crates\.io\/api\/v1\/crates\/\$NAME\/\$VERSION/);
  assert.match(crates, /200\) echo "[^\n]*\n\s+echo "published=true" >> "\$GITHUB_OUTPUT" ;;/, 'crates 200 means published');
  assert.match(crates, /404\) echo "published=false" >> "\$GITHUB_OUTPUT" ;;/, 'crates 404 means not published');
  assert.match(crates, /\*\) echo "::error::crates\.io returned HTTP/, 'crates fails on any other status');
  for (const name of BUILD_JOBS) assert.doesNotMatch(job(name), /npm view|crates\.io\/api/, `${name} does not gate publishing`);
});

test('all_publish_related_jobs_fail_on_pipe_errors', () => {
  for (const name of [...BUILD_JOBS, ...DRY_RUN_JOBS, ...PUBLISH_JOBS]) {
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
  // The tarball must outlive the publish approval wait, even a re-run after it timed out.
  assert.match(steps[upload], /retention-days: 90$/m);
});

// No expression is spliced into a shell script: values reach it through env, so a crafted
// artifact filename or package name can't run commands where the registry login is available.
// The text of every `run:` script in a job: from the `run:` key to the next line indented at or
// below it.
const runScripts = (j) => {
  const lines = j.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^( *)(?:- )?run:(.*)$/);
    if (!m) continue;
    const indent = lines[i].match(/^ */)[0].length + (lines[i].includes('- run:') ? 2 : 0);
    const body = [m[2]];
    for (let k = i + 1; k < lines.length && (lines[k].trim() === '' || lines[k].match(/^ */)[0].length > indent); k++) body.push(lines[k]);
    out.push(body.join('\n'));
  }
  return out;
};

test('no_expression_in_any_run_script', () => {
  const scripts = [];
  for (const [name, text] of Object.entries(jobsOf(workflow()))) {
    for (const script of runScripts(text)) {
      scripts.push(script);
      assert.doesNotMatch(script, /\$\{\{/, `${name} has no \${{ }} inside a run script`);
    }
  }
  // Self-check: the capture reaches the end of multi-line scripts, not just their first line.
  assert.ok(scripts.some((x) => x.includes('tar -xOf') && x.includes('GITHUB_OUTPUT')), 'the tarball script is captured whole');
  assert.ok(scripts.some((x) => x.includes('cargo metadata') && x.includes('GITHUB_OUTPUT')), 'the crates version script is captured whole');
});

test('publish_npm_validates_the_tarball_name_and_package_name', () => {
  for (const name of ['publish', 'dry-run-npm']) {
    const j = job(name);
    assert.match(j, /\^\(@\[a-z0-9~-\]\[a-z0-9\._~-\]\*\/\)\?\[a-z0-9~-\]\[a-z0-9\._~-\]\*\$/, `${name}: package name is checked against the npm name pattern`);
    assert.match(j, /::error::[^\n]*tarball file name/, `${name}: a bad tarball file name fails`);
    assert.match(j, /case "\$\{1##\*\/\}" in\n\s+\*\[!A-Za-z0-9@\._~-\]\*\|\.\*\|-\*\) echo "::error::unexpected tarball file name"; exit 1 ;;/, `${name}: only a plain file name is accepted`);
    const lines = j.split('\n').map((l) => l.trim());
    const check = lines.indexOf('[[ "$name" =~ $name_pattern ]] || { echo "::error::tarball has an invalid package name"; exit 1; }');
    const exported = lines.indexOf('echo "name=$name" >> "$GITHUB_OUTPUT"');
    assert.ok(check >= 0, `${name}: a bad package name fails the job`);
    assert.ok(exported > check, `${name}: the package name is validated before it is written to GITHUB_OUTPUT`);
    assert.equal(lines.filter((l) => l.includes('>> "$GITHUB_OUTPUT"') && l.includes('name=')).length, 1, `${name}: name is exported once`);
    assert.doesNotMatch(j, /steps\.tarball\.outputs\.file/, `${name}: the file name is never passed on as an output`);
  }
  assert.match(job('publish'), /^ {10}npm publish "\$1" --ignore-scripts$/m, 'publishes the re-globbed, validated tarball');
});

test('registry_check_inputs_come_from_the_right_place', () => {
  const steps = stepsOf(job('publish'));
  const tarball = steps.find((x) => /id: tarball/.test(x));
  assert.match(tarball, /^ {8}env:\n {10}VERSION: \$\{\{ needs\.release-please\.outputs\.version \}\}$/m, 'tarball step gets the release version');
  assert.match(tarball, /^ {10}echo "name=\$name" >> "\$GITHUB_OUTPUT"$/m, 'tarball step exports the validated name');
  assert.doesNotMatch(tarball, /file=/, 'tarball step exports no file name');
  const registry = steps.find((x) => /id: npm-registry/.test(x));
  assert.match(registry, /^ {10}NAME: \$\{\{ steps\.tarball\.outputs\.name \}\}$/m, 'npm NAME comes from the tarball step');
  assert.match(registry, /^ {10}VERSION: \$\{\{ needs\.release-please\.outputs\.version \}\}$/m);
  const crates = steps.find((x) => /id: crates-registry/.test(x));
  assert.match(crates, /^ {10}NAME: \$\{\{ needs\.verify-crates\.outputs\.name \}\}$/m, 'crates NAME comes from verify-crates');
  assert.match(crates, /^ {10}VERSION: \$\{\{ needs\.release-please\.outputs\.version \}\}$/m);
  // A dry run has no release version: dry-run-npm checks the version build-npm checked.
  const dry = stepsOf(job('dry-run-npm'));
  assert.match(dry.find((x) => /id: tarball/.test(x)), /^ {10}VERSION: \$\{\{ needs\.build-npm\.outputs\.version \}\}$/m);
});

test('publish_npm_publishes_only_the_prepared_tarball', () => {
  const j = job('publish');
  assert.doesNotMatch(j, /npm (ci|install)/, 'no install in the job with id-token');
  const checkout = markedSteps(j).filter((s) => /actions\/checkout/.test(s.text));
  assert.deepEqual(checkout.map((s) => s.target), ['crates'], 'only the crate is checked out; npm uses the tarball');
  assert.match(j, /actions\/download-artifact@/);
  assert.match(j, /name: npm-package/);
  assert.match(j, /tar -xOf "\$1" package\/package\.json/, 'reads the tarball package.json');
  assert.match(j, /if \[ "\$actual" != "\$VERSION" \]; then\n {12}echo "::error::tarball version[^\n]*\n {12}exit 1/, 'fails when the tarball version differs');
  assert.match(j, /npm publish "\$1" --ignore-scripts$/m, 'publishes the tarball without lifecycle scripts');
  assert.ok(j.indexOf('tar -xOf') < j.indexOf('npm publish'), 'checks the tarball before publishing');
  assert.doesNotMatch(j, /npm run|npm pack/, 'no build code runs here');
});

test('crates_build_runs_without_credentials', () => {
  const verify = job('verify-crates');
  assert.match(verify, /^ {12}cargo package "\$\{locked\[@\]\}"$/m, 'verify-crates compiles the package');
  assert.doesNotMatch(verify, /CARGO_REGISTRY_TOKEN|crates-io-auth-action/, 'no token while building');
  const publish = job('publish');
  assert.match(publish, /^ {10}cargo publish --no-verify "\$\{locked\[@\]\}"$/m, 'publish does not rebuild');
  assert.doesNotMatch(publish, /cargo (package|build|test)/, 'no build in the job with id-token');
});

test('publish_jobs_use_trusted_publishing', () => {
  const yml = workflow();
  assert.doesNotMatch(yml, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.CARGO_REGISTRY_TOKEN/, 'no stored registry token');
  for (const name of ['build-npm', 'dry-run-npm', 'publish']) {
    assert.match(job(name), /^ {6}- uses: actions\/setup-node@\S+ # v\S+\n {8}with:\n(?: {10}.*\n)*? {10}registry-url: https:\/\/registry\.npmjs\.org$/m, `${name} sets the registry`);
  }
  const crates = job('publish');
  assert.match(crates, /^ {8}uses: rust-lang\/crates-io-auth-action@/m);
  assert.match(crates, /^ {10}CARGO_REGISTRY_TOKEN: \$\{\{ steps\.auth\.outputs\.token \}\}$/m);
  assert.equal(yml.split('CARGO_REGISTRY_TOKEN').length - 1, 1, 'the token appears in one step only');
});

test('artifact_actions_are_pinned_to_sha', () => {
  assert.match(job('build-npm'), new RegExp(`uses: actions/upload-artifact${SHA.source}`));
  assert.match(job('publish'), new RegExp(`uses: actions/download-artifact${SHA.source}`));
  assert.match(job('dry-run-npm'), new RegExp(`uses: actions/download-artifact${SHA.source}`));
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
const actionlint = (yml) => {
  // actionlint (as of 1.7.12) does not know the ubuntu-26.04 label yet; remove this config once it does.
  const tmp = mkdtempSync(join(tmpdir(), 'actionlint-'));
  const config = join(tmp, 'actionlint.yaml');
  const file = join(tmp, 'release.yml');
  try {
    writeFileSync(config, 'self-hosted-runner:\n  labels:\n    - ubuntu-26.04\n');
    writeFileSync(file, yml);
    return spawnSync('actionlint', ['-config-file', config, file], { encoding: 'utf8' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

test('release_workflow_passes_actionlint', { skip: !hasActionlint && 'actionlint is not on PATH' }, () => {
  const res = actionlint(workflow());
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('each_single_target_trim_keeps_only_that_target', () => {
  const npm = trimTo(workflow(), 'npm');
  assert.deepEqual(Object.keys(jobsOf(npm)).sort(), ['build-npm', 'dry-run-npm', 'publish', 'release-please']);
  assert.match(jobsOf(npm).publish, /^ {4}needs: \[release-please, build-npm\]$/m);
  assert.doesNotMatch(jobsOf(npm).publish, /cargo|crates-io-auth-action|actions\/checkout/);
  const crates = trimTo(workflow(), 'crates');
  assert.deepEqual(Object.keys(jobsOf(crates)).sort(), ['publish', 'release-please', 'verify-crates']);
  assert.match(jobsOf(crates).publish, /^ {4}needs: \[release-please, verify-crates\]$/m);
  assert.doesNotMatch(jobsOf(crates).publish, /npm (view|publish)|download-artifact|setup-node/);
});

test('each_single_target_trim_publishing_comment_names_only_the_kept_target', () => {
  const publishingComment = (yml) => yml.match(/^ {2}# Publishing:.*\n(?: {2}#.*\n)*/m)?.[0] ?? '';
  for (const [keep, other] of [['npm', /crates|cargo/i], ['crates', /npm/i]]) {
    const comment = publishingComment(trimTo(workflow(), keep));
    assert.ok(comment, `${keep} only: the # Publishing: comment is kept`);
    assert.doesNotMatch(comment, other, `${keep} only: the # Publishing: comment names only ${keep}`);
  }
});

test('each_single_target_trim_passes_actionlint', { skip: !hasActionlint && 'actionlint is not on PATH' }, () => {
  for (const target of ['npm', 'crates']) {
    const res = actionlint(trimTo(workflow(), target));
    assert.equal(res.status, 0, `${target} only:\n${res.stdout}${res.stderr}`);
  }
});

test('release template pins ubuntu-26.04 runners', () => {
  const jobs = jobsOf(workflow());
  for (const [name, text] of Object.entries(jobs)) {
    assert.match(text, /^ {4}runs-on: ubuntu-26\.04$/m, `${name} runs on ubuntu-26.04`);
  }
});

test('baton workflows pin ubuntu-26.04 runners', () => {
  const wfDir = new URL('../../.github/workflows/', import.meta.url).pathname;
  const files = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    for (const [name, text] of Object.entries(jobsOf(readFileSync(join(wfDir, f), 'utf8')))) {
      assert.match(text, /^ {4}runs-on: ubuntu-26\.04$/m, `${f} ${name} runs on ubuntu-26.04`);
    }
  }
});

test('release template uses Node 24 or newer', () => {
  const versions = [...workflow().matchAll(/^\s*node-version: "?(\d+)/gm)].map((m) => Number(m[1]));
  assert.ok(versions.length > 0, 'template sets a node version');
  for (const v of versions) assert.ok(v >= 24, `node-version ${v} is at least 24`);
});

test('baton ci and drift workflows set up Node 24 or newer before running node', () => {
  const wfDir = new URL('../../.github/workflows/', import.meta.url).pathname;
  for (const f of ['ci.yml', 'drift.yml']) {
    const steps = stepsOf(readFileSync(join(wfDir, f), 'utf8').split(/^jobs:$/m)[1]);
    const setup = steps.findIndex((st) => /^uses: actions\/setup-node@[0-9a-f]{40} # v\d+/m.test(st));
    assert.notEqual(setup, -1, `${f} has a pinned setup-node step`);
    const version = steps[setup].match(/node-version: "?(\d+)/);
    assert.ok(version && Number(version[1]) >= 24, `${f} sets node-version 24 or newer`);
    const firstNode = steps.findIndex((st) => /^\s*(run: |\s+)[^\n]*\b(node|npm|make)\b/m.test(st) && /run:/.test(st));
    assert.ok(firstNode === -1 || setup < firstNode, `${f} sets up Node before its first node/npm/make step`);
  }
});
