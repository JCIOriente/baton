// The npm package (@jcioriente/baton): what `npm pack` ships, and that the unpacked CLI runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;

const read = (path) => readFileSync(join(root, path), 'utf8');

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
  const under = (dir) =>
    assert.ok(
      files.some((f) => f.startsWith(dir)),
      `${dir} is packed`,
    );
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
    assert.deepEqual(
      files.filter((f) => f.startsWith(dir)),
      [],
      `nothing under ${dir}`,
    );
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

test('package.json publishes the public scoped package', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, '@jcioriente/baton');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig.access, 'public');
});

// The jobs of a workflow by name, as text: a job starts at a two-space key under `jobs:`.
function jobs(text) {
  const out = {};
  let name;
  for (const line of text.slice(text.indexOf('\njobs:')).split('\n').slice(2)) {
    const key = line.match(/^ {2}([\w-]+):$/);
    if (key) name = key[1];
    if (name) (out[name] ??= []).push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

// What baton:init step 6 leaves for release.publish ["npm"] in a repo with engines.node ">=22".
function trimmedTemplate() {
  const lines = read('templates/release/release.yml').split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^(\s*)# baton:init: keep this (?:job|step) only when release\.publish has "(\w+)"/);
    if (!marker) {
      kept.push(lines[i]);
      continue;
    }
    if (marker[2] === 'npm') continue;
    i++;
    while (/^\s*#/.test(lines[i])) i++;
    i++;
    while (i < lines.length && (lines[i] === '' || lines[i].search(/\S/) > marker[1].length)) i++;
    i--;
  }
  return kept
    .join('\n')
    .replaceAll('<base-branch>', 'main')
    .replace('needs: [release-please, build-npm, verify-crates]', 'needs: [release-please, build-npm]')
    .replaceAll('node-version: "26"', 'node-version: "24"');
}

test('release.yml carries the npm jobs as baton:init step 6 leaves them', () => {
  const expected = jobs(trimmedTemplate());
  const actual = jobs(read('.github/workflows/release.yml'));
  assert.deepEqual(Object.keys(actual), ['release-please', 'build-npm', 'dry-run-npm', 'publish']);
  for (const name of ['build-npm', 'dry-run-npm', 'publish']) assert.equal(actual[name], expected[name], name);
  assert.ok(read('.github/workflows/release.yml').endsWith('\n'), 'ends with a newline');
});

test('ci template runs baton verify from the published package', () => {
  const ci = read('templates/ci.yml');
  const { name } = JSON.parse(read('package.json'));
  assert.ok(ci.split('\n').some((l) => l.trim() === `- run: npm exec --yes --package=${name}@{{version}} -- baton verify --stage ci`));
  assert.ok(ci.includes('{{version}}') && ci.includes('<base-branch>'));
  const uses = [...ci.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  for (const use of uses) assert.match(use, /@[0-9a-f]{40}$/, `${use} is pinned to a SHA`);
  assert.ok(Number(ci.match(/node-version: "(\d+)"/)[1]) >= 24, 'Node 24 or newer');
});
