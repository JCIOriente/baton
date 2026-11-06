import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestVersion, upstreamFindings, loadProvenance, lintProvenance } from '../lib/provenance.mjs';

const ok = (stdout) => () => ({ code: 0, stdout, stderr: '' });

test('latestVersion_reads_github_releases', async () => {
  let args;
  const gh = (a) => {
    args = a;
    return { code: 0, stdout: JSON.stringify({ tag_name: 'v7.0.1' }), stderr: '' };
  };
  assert.equal(await latestVersion('github:actions/checkout', { gh }), '7.0.1');
  assert.deepEqual(args, ['api', 'repos/actions/checkout/releases/latest']);
  assert.equal(await latestVersion('github:a/b', { gh: ok('{"tag_name":"2.0.0"}') }), '2.0.0');
});

test('latestVersion_github_failures_surface', async () => {
  const fails = [
    () => ({ code: 1, stdout: '', stderr: 'HTTP 404' }),
    ok('not json'),
    ok('{}'),
    ok('{"tag_name":""}'),
    () => {
      throw new Error("'gh' not found on PATH");
    },
  ];
  for (const gh of fails) await assert.rejects(latestVersion('github:a/b', { gh }));
  await assert.rejects(latestVersion('github:nope', { gh: ok('{"tag_name":"v1"}') }));
});

test('upstreamFindings reports github releases outside the range and errors', async () => {
  const facts = [
    { id: 'a.one', file: 'f', anchor: 'x', pkg: 'github:o/old', requires: '>=1 <2' },
    { id: 'a.two', file: 'f', anchor: 'x', pkg: 'github:o/same', requires: '>=1 <2' },
    { id: 'a.three', file: 'f', anchor: 'x', pkg: 'github:o/broken', requires: '>=1 <2' },
  ];
  const gh = ([, path]) => {
    if (path.includes('/old/')) return { code: 0, stdout: '{"tag_name":"v2.0.0"}', stderr: '' };
    if (path.includes('/same/')) return { code: 0, stdout: '{"tag_name":"v1.4.0"}', stderr: '' };
    return { code: 1, stdout: '', stderr: 'boom' };
  };
  const findings = await upstreamFindings({ sources: [], facts }, { gh });
  assert.deepEqual(findings.map((f) => `${f.kind}:${f.fact}`), ['release:a.one', 'error:a.three']);
  assert.equal(findings[0].latest, '2.0.0');
});

test('provenance.json tracks every action pinned in the release template', () => {
  const root = new URL('../..', import.meta.url).pathname;
  assert.deepEqual(lintProvenance(root), []);
  const pinned = [...new Set([...(releaseYml(root)).matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@/g)].map((m) => m[1]))];
  const tracked = loadProvenance(root).facts.filter((f) => f.pkg.startsWith('github:')).map((f) => f.pkg.slice(7));
  assert.deepEqual(tracked.sort(), pinned.sort());
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function releaseYml(root) {
  return readFileSync(join(root, 'templates/release/release.yml'), 'utf8');
}
