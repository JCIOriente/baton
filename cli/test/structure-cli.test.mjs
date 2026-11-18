import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../baton.mjs', import.meta.url).pathname;
// Isolated from the user's git config (signing, hooks), with a fixed identity.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GH_TOKEN: '',
};

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout;
}

function baton(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
}

const lines = (n) => 'x\n'.repeat(n);

function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** A repo whose one commit holds `files`, plus `.baton/config.json` when `config` is given. */
function repo(t, { config, files = {} } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-structure-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'acme');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, { ...files, ...(config ? { '.baton/config.json': JSON.stringify(config) } : {}) });
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init', '--allow-empty');
  return { dir, root };
}

/** The `✖` finding lines and the summary of a text run. */
const findings = (stderr) => stderr.split('\n').filter((l) => l.startsWith('✖ '));
const summary = (stderr) => stderr.split('\n').find((l) => l.startsWith('structure: '));
const SPLIT = 'Split it in this PR (stacks/common.md, Size and structure).';

test('structure CLI passes with 0 files checked in a repo with no source files', (t) => {
  const { root } = repo(t, { files: { 'README.md': lines(900) } });
  const res = baton(root, 'structure');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, '');
  assert.equal(res.stderr, 'structure: 0 files checked, limit 500, 0 allowlisted, no failures, 1 files not counted (no guide for their extension)\n');
});

test('structure CLI uses the default limit when the config has no structure', (t) => {
  const { root } = repo(t, { config: { stacks: [] }, files: { 'a.js': lines(500), 'b.ts': lines(501) } });
  const res = baton(root, 'structure');
  assert.equal(res.status, 1, res.stderr);
  assert.deepEqual(findings(res.stderr), [`✖ b.ts: 501 lines, over the 500-line limit. ${SPLIT}`]);
  assert.equal(summary(res.stderr), 'structure: 2 files checked, limit 500, 0 allowlisted, 1 failures, 1 files not counted (no guide for their extension)');
});

test('structure CLI counts an untracked file over the limit', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } } });
  write(root, { 'src/new.js': lines(4), 'src/ok.js': lines(3) });
  const res = baton(root, 'structure');
  assert.equal(res.status, 1, res.stderr);
  assert.deepEqual(findings(res.stderr), [`✖ src/new.js: 4 lines, over the 3-line limit. ${SPLIT}`]);
  assert.match(summary(res.stderr), /^structure: 2 files checked, limit 3, 0 allowlisted, 1 failures/);
});

test('structure CLI never counts a plain untracked file under .worktrees', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { 'a.js': lines(1) } });
  // A plain folder, neither a git checkout nor excluded, so only the skip keeps it out.
  write(root, { '.worktrees/task-1-x/big.js': lines(9), '.worktrees/notes.txt': 'x\n' });
  assert.match(git(root, 'status', '--porcelain'), /\.worktrees\//);
  const res = baton(root, 'structure');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stderr, 'structure: 1 files checked, limit 3, 0 allowlisted, no failures, 1 files not counted (no guide for their extension)\n');
});

test('structure CLI prints the allowlist block only with --suggest-allowlist', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { 'b.rs': lines(5), 'a.ts': lines(4), 'c.js': lines(2) } });
  const plain = baton(root, 'structure');
  assert.equal(plain.status, 1, plain.stderr);
  assert.doesNotMatch(plain.stderr, /To record these/);
  assert.ok(plain.stderr.endsWith(`${summary(plain.stderr)}\n`), 'the summary is last');

  const res = baton(root, 'structure', '--suggest-allowlist');
  assert.equal(res.status, 1, res.stderr);
  assert.equal(res.stdout, '');
  assert.deepEqual(res.stderr.split('\n'), [
    `✖ a.ts: 4 lines, over the 3-line limit. ${SPLIT}`,
    `✖ b.rs: 5 lines, over the 3-line limit. ${SPLIT}`,
    'structure: 3 files checked, limit 3, 0 allowlisted, 2 failures, 1 files not counted (no guide for their extension)',
    "To record these instead of splitting them (needs the owner's approval), add to structure.allowlist:",
    '  "a.ts": 4,',
    '  "b.rs": 5',
    '',
  ]);
});

test('structure CLI prints the contract JSON on stdout and the text on stderr', (t) => {
  const { root } = repo(t, {
    config: { structure: { maxLines: 3, allowlist: { 'gone.js': 7, 'held.js': 5 } } },
    files: { 'test/a.test.mjs': lines(4), 'held.js': lines(5), 'gone.js': lines(7) },
  });
  rmSync(join(root, 'gone.js'));
  const res = baton(root, 'structure', '--json');
  assert.equal(res.status, 1, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout), {
    ok: false,
    maxLines: 3,
    checked: 2,
    notCounted: 1,
    files: [
      { path: 'gone.js', lines: null, allowlisted: 7, state: 'not-counted' },
      { path: 'held.js', lines: 5, allowlisted: 5, state: 'held' },
      { path: 'test/a.test.mjs', lines: 4, allowlisted: null, state: 'unlisted' },
    ],
  });
  assert.deepEqual(findings(res.stderr), [
    '✖ gone.js: on structure.allowlist but not counted (missing). Remove its entry.',
    `✖ test/a.test.mjs: 4 lines, over the 3-line limit. ${SPLIT}`,
  ]);
});

test('structure CLI does not count ignored, excluded, non-source, deleted, symlinked or submodule files', (t) => {
  const { dir, root } = repo(t, {
    config: { structure: { maxLines: 3, exclude: ['gen/**'] } },
    files: { '.gitignore': 'build/\n', 'gen/api.ts': lines(9), 'gen/schema.json': lines(9), 'notes.txt': lines(9), 'gone.js': lines(9), 'ok.js': lines(1) },
  });
  const sub = join(dir, 'sub');
  mkdirSync(sub);
  git(sub, 'init', '-q', '-b', 'main');
  write(sub, { 'big.js': lines(9) });
  git(sub, 'add', '-A');
  git(sub, 'commit', '-qm', 'sub');
  git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'vendor.rs');
  write(root, { 'build/out.js': lines(9) });
  symlinkSync('notes.txt', join(root, 'link.js'));
  rmSync(join(root, 'gone.js'));

  const res = baton(root, 'structure');
  assert.equal(res.status, 0, res.stderr);
  // .baton/config.json, .gitignore, .gitmodules and notes.txt are skipped for their extension;
  // gen/schema.json is excluded, which comes first.
  assert.equal(res.stderr, 'structure: 1 files checked, limit 3, 0 allowlisted, no failures, 4 files not counted (no guide for their extension)\n');

  const allowlist = { 'build/out.js': 9, 'gen/api.ts': 9, 'gone.js': 9, 'link.js': 9, 'notes.txt': 9, 'vendor.rs': 9 };
  write(root, { '.baton/config.json': JSON.stringify({ structure: { maxLines: 3, exclude: ['gen/**'], allowlist } }) });
  const listed = baton(root, 'structure');
  assert.equal(listed.status, 1, listed.stderr);
  const why = (path, reason) => `✖ ${path}: on structure.allowlist but not counted (${reason}). Remove its entry.`;
  assert.deepEqual(findings(listed.stderr), [
    why('build/out.js', 'ignored by git'),
    why('gen/api.ts', 'excluded'),
    why('gone.js', 'missing'),
    why('link.js', 'not a regular file'),
    why('notes.txt', 'no source extension'),
    why('vendor.rs', 'not a regular file'),
  ]);
});

test('structure CLI checks the whole checkout from a subdirectory', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { 'top.js': lines(4), 'src/deep/a.js': lines(1) } });
  const res = baton(join(root, 'src/deep'), 'structure');
  assert.equal(res.status, 1, res.stderr);
  assert.deepEqual(findings(res.stderr), [`✖ top.js: 4 lines, over the 3-line limit. ${SPLIT}`]);
  assert.match(summary(res.stderr), /^structure: 2 files checked/);
});

test('structure CLI matches allowlist paths with spaces and non-ASCII characters', (t) => {
  const path = 'src/my dir/café ünï.js';
  const { root } = repo(t, { config: { structure: { maxLines: 3, allowlist: { [path]: 5 } } }, files: { [path]: lines(5) } });
  const res = baton(root, 'structure', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout).files, [{ path, lines: 5, allowlisted: 5, state: 'held' }]);

  write(root, { [path]: lines(6) });
  const grew = baton(root, 'structure');
  assert.deepEqual(findings(grew.stderr), [`✖ ${path}: 6 lines, allowlisted at 5. It grew: split it in this PR (stacks/common.md, Size and structure).`]);
});

test('structure CLI writes nothing', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3, allowlist: { 'a.js': 9 } } }, files: { 'a.js': lines(5), 'b.js': lines(4) } });
  write(root, { 'c.js': lines(4) });
  const config = join(root, '.baton/config.json');
  const before = { status: git(root, 'status', '--porcelain', '--untracked-files=all'), mtime: statSync(config).mtimeMs };
  for (const args of [[], ['--json'], ['--suggest-allowlist'], ['--json', '--suggest-allowlist']]) {
    assert.equal(baton(root, 'structure', ...args).status, 1);
  }
  assert.deepEqual({ status: git(root, 'status', '--porcelain', '--untracked-files=all'), mtime: statSync(config).mtimeMs }, before);
});

test('structure CLI reports an invalid structure config as a baton error', (t) => {
  const { root } = repo(t, { config: { structure: { maxline: 3 } } });
  const res = baton(root, 'structure');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /structure\.maxline: unknown key/);
});

test('baton help lists the structure command', (t) => {
  const { root } = repo(t);
  const res = baton(root, 'help');
  assert.equal(res.status, 0);
  assert.ok(res.stdout.includes('structure [--json] [--suggest-allowlist]   Check source files against the size limit and allowlist'), res.stdout);
});
