// The files baton:init writes when a repo enables releases (templates/release/).
// YAML is checked with plain text matching: the CLI has no dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(yml, /^ {2}push:\n {4}branches: \[[^\]]+\]/m, 'runs on push to the base branch');
  assert.match(yml, /^permissions: \{\}$/m, 'top-level permissions are empty');
  assert.match(yml, /^concurrency:\n {2}group: release\n {2}cancel-in-progress: false$/m);
  assert.match(yml, /^ {2}release-please:$/m, 'release-please job');
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
  assert.ok(uses.some(([, ref]) => ref.startsWith('googleapis/release-please-action@')));
});
