import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestVersion, upstreamFindings, loadProvenance } from '../lib/provenance.mjs';
import { run, BatonError } from '../lib/util.mjs';

const ok = (stdout) => () => ({ code: 0, stdout, stderr: '' });

test('latestVersion_reads_github_releases', async () => {
  let args;
  const gh = (a) => {
    args = a;
    return { code: 0, stdout: 'v7.0.1\n', stderr: '' };
  };
  assert.equal(await latestVersion('github:actions/checkout', { gh }), '7.0.1');
  assert.deepEqual(args, ['api', 'repos/actions/checkout/releases/latest', '--jq', '.tag_name']);
  assert.equal(await latestVersion('github:a/b', { gh: ok('2.0.0') }), '2.0.0');
});

test('latestVersion_github_failures_surface', async () => {
  const cases = [
    [() => ({ code: 1, stdout: '', stderr: 'HTTP 404' }), /HTTP 404/],
    [ok(''), /no tag_name/],
    [ok('null'), /no tag_name/],
    [
      () => {
        throw new BatonError("'gh' not found on PATH");
      },
      /not found on PATH/,
    ],
  ];
  for (const [gh, message] of cases) await assert.rejects(latestVersion('github:a/b', { gh }), message);
  await assert.rejects(latestVersion('github:nope', { gh: ok('v1') }), /bad github repo/);
});

test('run reports a timed-out command as an error', () => {
  assert.throws(() => run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 100 }), /timed out/);
});

test('upstreamFindings reports github releases outside the range and errors', async () => {
  const facts = [
    { id: 'a.one', file: 'f', anchor: 'x', pkg: 'github:o/old', requires: '>=1 <2' },
    { id: 'a.two', file: 'f', anchor: 'x', pkg: 'github:o/same', requires: '>=1 <2' },
    { id: 'a.three', file: 'f', anchor: 'x', pkg: 'github:o/broken', requires: '>=1 <2' },
  ];
  const gh = ([, path]) => {
    if (path.includes('/old/')) return { code: 0, stdout: 'v2.0.0', stderr: '' };
    if (path.includes('/same/')) return { code: 0, stdout: 'v1.4.0', stderr: '' };
    return { code: 1, stdout: '', stderr: 'boom' };
  };
  const findings = await upstreamFindings({ sources: [], facts }, { gh });
  assert.deepEqual(findings.map((f) => `${f.kind}:${f.fact}`), ['release:a.one', 'error:a.three']);
  assert.equal(findings[0].latest, '2.0.0');
});

test('provenance.json tracks every action pinned in the release template', () => {
  const root = new URL('../..', import.meta.url).pathname;
  const yml = readFileSync(join(root, 'templates/release/release.yml'), 'utf8');
  const pinned = [...new Set([...yml.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@/g)].map((m) => m[1]))];
  const tracked = loadProvenance(root).facts.filter((f) => f.pkg.startsWith('github:')).map((f) => f.pkg.slice(7));
  assert.deepEqual(tracked.sort(), pinned.sort());
});
