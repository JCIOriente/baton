// The npm package (@jcioriente/baton): what `npm pack` ships, and that the unpacked CLI runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;

function pack() {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  // Newer npm keys the report by package name, older npm returns an array: both work here.
  return Object.values(JSON.parse(res.stdout))[0].files.map((f) => f.path);
}

// Every path the CLI and the hooks read at runtime (PLUGIN_ROOT and import.meta.url users).
test('package files include every path the CLI reads at runtime', () => {
  const files = pack();
  const has = (path) => assert.ok(files.includes(path), `${path} is packed`);
  const under = (dir) => assert.ok(files.some((f) => f.startsWith(dir)), `${dir} is packed`);
  has('cli/baton.mjs');
  under('cli/lib/');
  has('templates/handoff.md');
  has('templates/git-hooks/worktree-guard.sh');
  under('templates/');
  under('reviewers/');
  under('stacks/');
  under('hooks/');
  has('provenance.json');
});

test('package excludes tests, evals, docs and skills', () => {
  const files = pack();
  for (const dir of ['cli/test/', 'tests/', 'evals/', 'docs/', 'skills/']) {
    assert.deepEqual(files.filter((f) => f.startsWith(dir)), [], `nothing under ${dir}`);
  }
});

test('unpacked package runs baton help', () => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-pack-'));
  try {
    const bin = unpack(dir);
    const res = spawnSync(process.execPath, [bin, 'help'], { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /baton/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unpacked package runs baton verify in a baton repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-pack-'));
  try {
    const bin = unpack(dir);
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, '.baton'), { recursive: true });
    writeFileSync(join(repo, '.baton', 'config.json'), JSON.stringify({ project: 'x', validate: [{ name: 'ok', run: 'true' }] }));
    const git = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);
    const res = spawnSync(process.execPath, [bin, 'verify'], { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stdout + res.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Packs the real tarball, unpacks it under dir/pkg and returns its CLI path.
function unpack(dir) {
  const out = join(dir, 'tgz');
  mkdirSync(out);
  const res = spawnSync('npm', ['pack', '--pack-destination', out, '--ignore-scripts', '--silent'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const [tgz] = readdirSync(out);
  const untar = spawnSync('tar', ['-xzf', join(out, tgz), '-C', dir], { encoding: 'utf8' });
  assert.equal(untar.status, 0, untar.stderr);
  return join(dir, 'package', 'cli', 'baton.mjs');
}
