import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * A fake `gh` first on PATH: it logs each call to <dir>/gh.log and answers as user `me`, who
 * already holds the claim on any issue `issue view` asks for (titled `title`).
 */
function withFakeGh(dir, { title = 'Task' } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'gh.log');
  const issue = { number: 12, title, body: '', state: 'OPEN', assignees: [], labels: [], url: '', comments: [{ author: { login: 'me' }, body: '<!-- baton:claim user=me nonce=abc -->' }] };
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
const a = process.argv.slice(2);
require('fs').appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
if (a[0] === 'api') console.log('me');
else if (a[0] === 'issue' && a[1] === 'list') console.log('[]');
else if (a[0] === 'issue' && a[1] === 'view') console.log(${JSON.stringify(JSON.stringify(issue))});
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return {
    log: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    run: (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, PATH: `${bin}:${env.PATH}` }, encoding: 'utf8' }),
  };
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
  // The existing branch carries its own commit, so a branch recreated from origin/main would differ.
  git(root, 'checkout', '-qb', 'orgs-spec');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'wip');
  git(root, 'checkout', '-q', 'main');
  const tip = git(root, 'rev-parse', 'orgs-spec');
  assert.notEqual(tip, git(root, 'rev-parse', 'origin/main'));
  const res = baton(root, 'worktree', 'add', 'orgs-spec', '--json');
  assert.equal(res.status, 0, res.stderr);
  const path = join(base, 'orgs-spec');
  assert.deepEqual(JSON.parse(res.stdout), { path, branch: 'orgs-spec', created: true });
  assert.equal(git(path, 'rev-parse', 'HEAD'), tip, 'the existing branch is checked out, not recreated');
});

test('worktree_add_setup_failure_keeps_worktree', (t) => {
  const { root, base } = repo(t, { setup: [{ name: 'boom', run: 'exit 1' }] });
  const res = baton(root, 'worktree', 'add', 'x', '--setup');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Setup failed/);
  assert.ok(existsSync(join(base, 'x')), 'the worktree is kept');
});

test('worktree_add_refuses_the_base_branch_and_the_main_checkout_branch', (t) => {
  const { root, base } = repo(t);
  const onBase = baton(root, 'worktree', 'add', 'main');
  assert.notEqual(onBase.status, 0);
  assert.match(onBase.stderr, /base branch/);
  git(root, 'checkout', '-qb', 'spec-release-phase');
  const onMain = baton(root, 'worktree', 'add', 'spec-release-phase');
  assert.notEqual(onMain.status, 0);
  assert.match(onMain.stderr, /main checkout/);
  assert.ok(!existsSync(base), 'no worktree was made');
});

test('worktree_add_refuses_a_path_another_worktree_holds', (t) => {
  const { root, base } = repo(t);
  git(root, 'worktree', 'add', '-q', '-b', 'task/12-x', join(base, 'task-12-x'), 'main');
  const res = baton(root, 'worktree', 'add', 'task-12-x');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /task\/12-x/);
  assert.equal(git(root, 'branch', '--list', 'task-12-x'), '', 'no branch was created');
});

test('worktree_add_warns_when_the_remote_base_is_missing', (t) => {
  const { root, base } = repo(t, { git: { remote: 'nope' } });
  const res = baton(root, 'worktree', 'add', 'offline');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /local main/);
  assert.ok(existsSync(join(base, 'offline')));
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

test('worktree_remove_by_numeric_name', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', '2027').status, 0);
  const res = baton(root, 'worktree', 'remove', '2027');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!existsSync(join(base, '2027')));
});

test('start_reuses_the_task_worktree_after_a_title_change', (t) => {
  const { dir, root, base } = repo(t);
  const path = join(base, 'task-12-old');
  git(root, 'worktree', 'add', '-q', '-b', 'task/12-old', path, 'main');
  const gh = withFakeGh(dir, { title: 'New title' });
  const res = gh.run(root, 'start', '12', '--no-baseline', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).path, path);
  assert.equal(git(root, 'branch', '--list', 'task/12-*'), '+ task/12-old', 'no new task branch');
});

test('start_creates_the_task_worktree_from_the_remote_base', (t) => {
  const { dir, root, base } = repo(t);
  const gh = withFakeGh(dir, { title: 'Task' });
  const res = gh.run(root, 'start', '12', '--no-baseline', '--json');
  assert.equal(res.status, 0, res.stderr);
  const path = join(base, 'task-12-task');
  assert.equal(JSON.parse(res.stdout).path, path);
  assert.equal(git(path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'task/12-task');
  assert.equal(git(path, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'origin/main'));
  const upstream = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'task/12-task@{u}'], { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(upstream.status, 0, 'the task branch has no upstream');
});

test('start_recreates_a_task_worktree_whose_directory_is_gone', (t) => {
  const { dir, root, base } = repo(t);
  const path = join(base, 'task-12-old');
  git(root, 'worktree', 'add', '-q', '-b', 'task/12-old', path, 'main');
  rmSync(path, { recursive: true, force: true });
  const gh = withFakeGh(dir, { title: 'New title' });
  const res = gh.run(root, 'start', '12', '--no-baseline', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).path, path);
  assert.ok(existsSync(path), 'the worktree is back on disk');
  assert.equal(git(path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'task/12-old');
});

test('worktree_add_recreates_a_worktree_whose_directory_is_gone', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'orgs-spec').status, 0);
  const path = join(base, 'orgs-spec');
  rmSync(path, { recursive: true, force: true });
  const res = baton(root, 'worktree', 'add', 'orgs-spec', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout), { path, branch: 'orgs-spec', created: true });
  assert.ok(existsSync(path), 'the worktree is back on disk');
  assert.equal(git(path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'orgs-spec');
});

test('worktree_remove_clears_a_record_whose_directory_is_gone', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'orgs-spec').status, 0);
  rmSync(join(base, 'orgs-spec'), { recursive: true, force: true });
  const res = baton(root, 'worktree', 'remove', 'orgs-spec');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /missing on disk/);
  assert.ok(!git(root, 'worktree', 'list', '--porcelain').includes('orgs-spec'), 'the stale record is gone');
  assert.equal(git(root, 'branch', '--list', 'orgs-spec'), 'orgs-spec', 'the branch is kept');
});

test('worktree_remove_by_zero_name', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', '0').status, 0);
  const res = baton(root, 'worktree', 'remove', '0');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!existsSync(join(base, '0')));
});

test('worktree_add_warns_when_the_fetch_fails', (t) => {
  const { root, base } = repo(t);
  const old = git(root, 'rev-parse', 'origin/main');
  git(root, 'remote', 'set-url', 'origin', join(root, 'nonexistent.git'));
  const res = baton(root, 'worktree', 'add', 'offline2');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /could not fetch/);
  assert.equal(git(join(base, 'offline2'), 'rev-parse', 'HEAD'), old);
});

test('init_labels_use_the_config_just_written', (t) => {
  const { dir, root, base } = repo(t, { tasks: { repo: 'org/old' } });
  const path = join(base, 'adopt');
  git(root, 'worktree', 'add', '-q', '-b', 'adopt', path, 'main');
  const gh = withFakeGh(dir);
  const res = gh.run(path, 'init', '--force', '--labels');
  assert.equal(res.status, 0, res.stderr);
  const creates = gh.log().filter((l) => l.startsWith('label create'));
  assert.ok(creates.length > 0, 'labels were ensured');
  assert.ok(creates.every((l) => !l.includes('org/old')), creates.join('\n'));
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

test('worktree_add_refuses_an_existing_directory', (t) => {
  const { root, base } = repo(t);
  mkdirSync(join(base, 'orgs-spec'), { recursive: true });
  writeFileSync(join(base, 'orgs-spec', 'note.txt'), 'mine\n');
  const res = baton(root, 'worktree', 'add', 'orgs-spec');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /already taken/);
  assert.equal(git(root, 'branch', '--list', 'orgs-spec'), '', 'no branch was created');
});

test('worktree_add_refuses_the_task_branch_prefix', (t) => {
  const { root } = repo(t);
  const res = baton(root, 'worktree', 'add', 'task');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /prefix/);
  assert.equal(git(root, 'branch', '--list', 'task'), '', 'no branch was created');
});

test('worktree_add_reports_a_locked_worktree_whose_directory_is_gone', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'orgs-spec').status, 0);
  const path = join(base, 'orgs-spec');
  git(root, 'worktree', 'lock', path);
  rmSync(path, { recursive: true, force: true });
  const res = baton(root, 'worktree', 'add', 'orgs-spec');
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /locked/);
  assert.match(res.stderr, /git worktree unlock/);
});

test('worktree_remove_reports_a_locked_worktree_whose_directory_is_gone', (t) => {
  const { root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'orgs-spec').status, 0);
  const path = join(base, 'orgs-spec');
  git(root, 'worktree', 'lock', path);
  rmSync(path, { recursive: true, force: true });
  const res = baton(root, 'worktree', 'remove', 'orgs-spec');
  assert.notEqual(res.status, 0);
  assert.doesNotMatch(res.stdout, /cleared its record/);
  assert.match(res.stderr, /git worktree unlock/);
});
