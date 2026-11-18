import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { splitPathList } from '../lib/structure.mjs';

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

  const big = '.worktrees/task-1-x/big.js';
  write(root, { '.baton/config.json': JSON.stringify({ structure: { maxLines: 3, allowlist: { [big]: 9 } } }) });
  const listed = baton(root, 'structure');
  assert.equal(listed.status, 1, listed.stderr);
  assert.deepEqual(findings(listed.stderr), [`✖ ${big}: on structure.allowlist but not counted (under .worktrees/). Remove its entry.`]);
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
  write(root, { 'build/out.js': lines(9), 'build/out.txt': lines(9) });
  symlinkSync('notes.txt', join(root, 'link.js'));
  symlinkSync('notes.txt', join(root, 'link.txt'));
  symlinkSync('api.ts', join(root, 'gen/alias.ts'));
  rmSync(join(root, 'gone.js'));

  const res = baton(root, 'structure');
  assert.equal(res.status, 0, res.stderr);
  // .baton/config.json, .gitignore, .gitmodules, notes.txt and the link.txt symlink are skipped
  // for their extension; gen/schema.json and the gen/alias.ts symlink are excluded, which comes first.
  assert.equal(res.stderr, 'structure: 1 files checked, limit 3, 0 allowlisted, no failures, 5 files not counted (no guide for their extension)\n');

  const allowlist = { 'build/out.js': 9, 'build/out.txt': 9, 'gen/alias.ts': 9, 'gen/api.ts': 9, 'gone.js': 9, 'link.js': 9, 'notes.txt': 9, 'vendor.rs': 9 };
  write(root, { '.baton/config.json': JSON.stringify({ structure: { maxLines: 3, exclude: ['gen/**'], allowlist } }) });
  const listed = baton(root, 'structure');
  assert.equal(listed.status, 1, listed.stderr);
  const why = (path, reason) => `✖ ${path}: on structure.allowlist but not counted (${reason}). Remove its entry.`;
  assert.deepEqual(findings(listed.stderr), [
    why('build/out.js', 'ignored by git'),
    why('build/out.txt', 'no source extension'),
    why('gen/alias.ts', 'excluded'),
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

test('structure CLI says why git did not list an allowlisted path', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { 'ok.js': lines(1) } });
  write(root, { 'old.js/readme.txt': 'x\n', 'nested/big.js': lines(9) });
  git(join(root, 'nested'), 'init', '-q', '-b', 'main');
  write(root, { '.baton/config.json': JSON.stringify({ structure: { maxLines: 3, allowlist: { 'old.js': 9, 'nested/big.js': 9 } } }) });
  const res = baton(root, 'structure');
  assert.equal(res.status, 1, res.stderr);
  const why = (path, reason) => `✖ ${path}: on structure.allowlist but not counted (${reason}). Remove its entry.`;
  assert.deepEqual(findings(res.stderr), [why('nested/big.js', 'not listed by git'), why('old.js', 'not a regular file')]);
  // The nested repo is listed as one folder entry, which isn't a file skipped for its extension.
  assert.match(summary(res.stderr), /^structure: 1 files checked, .*, 2 files not counted/);
});

test('structure CLI counts a file in a merge conflict once', (t) => {
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { 'big.js': lines(4) } });
  git(root, 'checkout', '-qb', 'other');
  write(root, { 'big.js': lines(5) });
  git(root, 'commit', '-qam', 'other');
  git(root, 'checkout', '-q', 'main');
  write(root, { 'big.js': lines(6) });
  git(root, 'commit', '-qam', 'main');
  assert.notEqual(spawnSync('git', ['merge', '-q', 'other'], { cwd: root, env }).status, 0);
  assert.match(git(root, 'ls-files', '--stage', 'big.js'), /\t.*\n.*\t.*\n.*\t/);
  const res = baton(root, 'structure');
  assert.equal(res.status, 1, res.stderr);
  assert.equal(findings(res.stderr).length, 1, res.stderr);
  assert.match(summary(res.stderr), /^structure: 1 files checked/);
});

test('structure CLI treats a tracked file whose folder became a file as missing', (t) => {
  const { root } = repo(t, { files: { 'a/b.js': lines(1) } });
  rmSync(join(root, 'a'), { recursive: true });
  write(root, { a: 'x\n' });
  const res = baton(root, 'structure');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stderr, 'structure: 0 files checked, limit 500, 0 allowlisted, no failures, 1 files not counted (no guide for their extension)\n');
});

test('structure CLI names the path it cannot inspect', (t) => {
  const { root } = repo(t, { files: { 'locked/x.js': lines(1) } });
  chmodSync(join(root, 'locked'), 0o000);
  let res;
  try {
    res = baton(root, 'structure');
  } finally {
    chmodSync(join(root, 'locked'), 0o755); // before the repo's cleanup, which can't enter it
  }
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stderr, /^baton: Cannot read locked\/x\.js: EACCES/);
  assert.doesNotMatch(res.stderr, /unexpected error/);
});

test('structure CLI escapes control characters in the paths it prints as text', (t) => {
  const path = 'evil\x1b[2K\r\u009bx.js';
  const { root } = repo(t, { config: { structure: { maxLines: 3 } }, files: { [path]: lines(4) } });
  const res = baton(root, 'structure', '--suggest-allowlist', '--json');
  assert.equal(res.status, 1, res.stderr);
  for (const c of ['\x1b', '\r', '\u009b']) assert.ok(!res.stderr.includes(c), JSON.stringify(res.stderr));
  assert.deepEqual(findings(res.stderr), [`✖ "evil\\u001b[2K\\r\\u009bx.js": 4 lines, over the 3-line limit. ${SPLIT}`]);
  assert.ok(res.stderr.includes('\n  "evil\\u001b[2K\\r\\u009bx.js": 4\n'), res.stderr);
  assert.equal(JSON.parse(res.stdout).files[0].path, path);
});

test('structure CLI keeps the bytes of a listed path that is not valid UTF-8', () => {
  // APFS refuses such names (EILSEQ), so this checks the listing the runner reads files by.
  const bad = Buffer.from([0x62, 0xff, 0x2e, 0x6a, 0x73]);
  const out = Buffer.concat([Buffer.from('a.js\0'), bad, Buffer.from('\0a.js\0')]);
  const listed = splitPathList(out);
  assert.deepEqual(
    listed.map((p) => p.path),
    ['a.js', 'b�.js'],
  );
  assert.ok(listed[1].raw.equals(bad));
});
