import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  return res.stdout.trim();
}

function baton(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
}

/** A clone of a bare "origin" whose main holds `config` as .baton/config.json (none if null). */
function repo(t, config = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-wt-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, 'origin.git');
  const root = join(dir, 'acme');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, root);
  git(root, 'checkout', '-qb', 'main');
  writeFileSync(join(root, 'README.md'), 'acme\n');
  if (config) {
    mkdirSync(join(root, '.baton'));
    writeFileSync(join(root, '.baton/config.json'), JSON.stringify(config));
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  git(root, 'push', '-q', 'origin', 'main');
  return { dir, root, base: join(dir, 'acme-worktrees') };
}

test('worktree_add_creates_untracked_branch_from_remote_base', (t) => {
  const { root, base } = repo(t);
  // Origin moves ahead of the local main: the new branch must start from origin/main.
  git(root, 'commit', '-q', '--allow-empty', '-m', 'local only');
  git(root, 'reset', '-q', '--hard', 'origin/main');
  const other = join(root, '..', 'other');
  git(join(root, '..'), 'clone', '-q', join(root, '..', 'origin.git'), other);
  git(other, 'commit', '-q', '--allow-empty', '-m', 'ahead');
  git(other, 'push', '-q', 'origin', 'main');

  const res = baton(root, 'worktree', 'add', 'Orgs Spec');
  assert.equal(res.status, 0, res.stderr);
  const path = join(base, 'orgs-spec');
  assert.ok(res.stdout.includes(path), res.stdout);
  assert.equal(git(path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'orgs-spec');
  assert.equal(git(path, 'rev-parse', 'HEAD'), git(other, 'rev-parse', 'HEAD'));
  const upstream = spawnSync('git', ['rev-parse', '--abbrev-ref', 'orgs-spec@{u}'], { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(upstream.status, 0, 'the branch has no upstream');
  assert.equal(git(root, 'status', '--porcelain'), '', 'the main checkout is untouched');
});

test('worktree_add_is_idempotent', (t) => {
  const { root, base } = repo(t);
  const first = baton(root, 'worktree', 'add', 'orgs-spec', '--json');
  assert.equal(first.status, 0, first.stderr);
  const path = join(base, 'orgs-spec');
  assert.deepEqual(JSON.parse(first.stdout), { path, branch: 'orgs-spec', created: true });
  const second = baton(join(base, 'orgs-spec'), 'worktree', 'add', 'orgs-spec', '--json');
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), { path, branch: 'orgs-spec', created: false });
  const plain = baton(root, 'worktree', 'add', 'orgs-spec');
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(plain.stdout.includes(path), plain.stdout);
});

test('worktree_add_checks_out_existing_branch', (t) => {
  const { root, base } = repo(t);
  git(root, 'branch', 'orgs-spec');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'on main only');
  const tip = git(root, 'rev-parse', 'orgs-spec');
  const res = baton(root, 'worktree', 'add', 'orgs-spec', '--json');
  assert.equal(res.status, 0, res.stderr);
  const path = join(base, 'orgs-spec');
  assert.deepEqual(JSON.parse(res.stdout), { path, branch: 'orgs-spec', created: true });
  assert.equal(git(path, 'rev-parse', 'HEAD'), tip, 'the existing branch is checked out, not recreated');
});

test('worktree_add_setup_only_with_flag', (t) => {
  const { root, base } = repo(t, { setup: [{ name: 'mark', run: 'touch setup-ran' }] });
  assert.equal(baton(root, 'worktree', 'add', 'plain').status, 0);
  assert.ok(!existsSync(join(base, 'plain', 'setup-ran')), 'no setup without --setup');
  const res = baton(root, 'worktree', 'add', 'with-setup', '--setup');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(join(base, 'with-setup', 'setup-ran')), 'setup ran in the new worktree');
  assert.ok(!existsSync(join(root, 'setup-ran')));
});

test('worktree_add_rejects_a_name_without_letters_or_digits', (t) => {
  const { root } = repo(t);
  const res = baton(root, 'worktree', 'add', '!!!');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /name/i);
  assert.notEqual(baton(root, 'worktree', 'add').status, 0, 'a missing name is an error too');
});

test('worktree_remove_by_name', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'orgs-spec').status, 0);
  const path = join(base, 'orgs-spec');
  writeFileSync(join(path, 'draft.md'), 'wip\n');
  const dirty = baton(root, 'worktree', 'remove', 'orgs-spec');
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /uncommitted/);
  assert.ok(existsSync(path));
  const forced = baton(root, 'worktree', 'remove', 'orgs-spec', '--force');
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!existsSync(path));
  assert.equal(git(root, 'branch', '--list', 'orgs-spec'), 'orgs-spec', 'the branch is kept');
  assert.notEqual(baton(root, 'worktree', 'remove', 'orgs-spec').status, 0, 'nothing left to remove');
});

test('worktree_remove_by_task_number_still_works', (t) => {
  const { root, base } = repo(t);
  const path = join(base, 'task-12-x');
  git(root, 'worktree', 'add', '-q', '-b', 'task/12-x', path, 'main');
  const res = baton(root, 'worktree', 'remove', '12');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!existsSync(path));
});

test('init_writes_into_current_worktree', (t) => {
  const { root, base } = repo(t, null);
  const path = join(base, 'adopt');
  git(root, 'worktree', 'add', '-q', '-b', 'adopt', path, 'main');
  const res = baton(path, 'init');
  assert.equal(res.status, 0, res.stderr);
  const written = JSON.parse(readFileSync(join(path, '.baton/config.json'), 'utf8'));
  assert.equal(written.hooks.worktreeOnly, true);
  assert.equal(written.project, 'acme');
  assert.ok(existsSync(join(path, 'docs/specs')) && existsSync(join(path, 'docs/plans')));
  assert.ok(!existsSync(join(root, '.baton')), 'no config in the main checkout');
  assert.ok(!existsSync(join(root, 'docs')), 'no docs dirs in the main checkout');
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('init in the main checkout writes worktreeOnly explicitly', (t) => {
  const { root } = repo(t, null);
  const res = baton(root, 'init');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.startsWith('Wrote .baton/config.json\n'), res.stdout);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.baton/config.json'), 'utf8')).hooks, { factGate: false, worktreeOnly: true });
});
