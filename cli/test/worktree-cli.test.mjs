import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
 * already holds the claim on any issue `issue view` asks for (titled `title`). `pr list --head B`
 * answers with `prs[B]` (none by default), read on every call so `setPrs` can change it after the
 * commits exist. `issue view N` takes its state from `issueStates[N]`, and fails like gh on a
 * missing issue for a number in `missingIssues`. With `loggedOut`, every call fails the way gh
 * does without a login.
 */
function withFakeGh(dir, { title = 'Task', issueStates = {}, missingIssues = [], loggedOut = false } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'gh.log');
  const prsFile = join(dir, 'gh-prs.json');
  writeFileSync(prsFile, '{}');
  const issue = { number: 12, title, body: '', state: 'OPEN', assignees: [], labels: [], url: '', comments: [{ author: { login: 'me' }, body: '<!-- baton:claim user=me nonce=abc -->' }] };
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
if (${loggedOut}) { console.error('To get started with GitHub CLI, please run:  gh auth login'); process.exit(4); }
if (a[0] === 'api') console.log('me');
else if (a[0] === 'issue' && a[1] === 'list') console.log('[]');
else if (a[0] === 'issue' && a[1] === 'view' && ${JSON.stringify(missingIssues.map(String))}.includes(a[2])) { console.error('GraphQL: Could not resolve to an issue or pull request'); process.exit(1); }
else if (a[0] === 'issue' && a[1] === 'view') console.log(JSON.stringify({ ...${JSON.stringify(issue)}, number: Number(a[2]), state: ${JSON.stringify(issueStates)}[a[2]] ?? 'OPEN' }));
else if (a[0] === 'pr' && a[1] === 'list') console.log(JSON.stringify(JSON.parse(fs.readFileSync(${JSON.stringify(prsFile)}, 'utf8'))[a[a.indexOf('--head') + 1]] ?? []));
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return {
    log: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    setPrs: (prs) => writeFileSync(prsFile, JSON.stringify(prs)),
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

/** A worktree on branch `name` with one commit pushed to origin. */
function pushedWorktree(root, base, name) {
  assert.equal(baton(root, 'worktree', 'add', name).status, 0);
  const path = join(base, name);
  git(path, 'commit', '-q', '--allow-empty', '-m', name);
  git(path, 'push', '-q', '-u', 'origin', name);
  return { path, head: git(path, 'rev-parse', 'HEAD') };
}

function pr(number, state, headRefOid) {
  return { number, state, url: `https://github.com/acme/acme/pull/${number}`, headRefOid };
}

function cleanRows(res) {
  assert.equal(res.status, 0, res.stderr);
  return Object.fromEntries(JSON.parse(res.stdout).map((r) => [r.branch, r]));
}

test('worktree_clean_removes_merged_worktrees_and_keeps_their_branches', (t) => {
  const { dir, root, base } = repo(t);
  const plan = pushedWorktree(root, base, 'app-shell-plan');
  const spike = pushedWorktree(root, base, 'spike-spec');
  // A squash merge deletes the remote branch; the PR head still matches the local branch.
  git(root, 'push', '-q', 'origin', '--delete', 'spike-spec');
  git(root, 'fetch', '-q', '--prune');
  const gh = withFakeGh(dir);
  // Several PRs for one branch: the newest decides, whatever order gh lists them in.
  gh.setPrs({ 'app-shell-plan': [pr(3, 'CLOSED', plan.head), pr(5, 'MERGED', plan.head)], 'spike-spec': [pr(11, 'MERGED', spike.head)] });
  const res = gh.run(root, 'worktree', 'clean');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^Removed:\n/);
  assert.match(res.stdout, /app-shell-plan.*PR #5 merged/);
  assert.match(res.stdout, /spike-spec.*PR #11 merged/);
  assert.ok(!existsSync(plan.path) && !existsSync(spike.path), 'both worktrees are gone');
  assert.equal(git(root, 'branch', '--list', 'app-shell-plan', 'spike-spec'), 'app-shell-plan\n  spike-spec', 'the branches are kept');
  assert.ok(gh.log().includes('pr list --head app-shell-plan --state all --json number,state,url,headRefOid'), gh.log().join('\n'));
});

test('worktree_clean_delete_branch_deletes_only_merged_local_branches', (t) => {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  const closed = pushedWorktree(root, base, 'closed-one');
  const gh = withFakeGh(dir);
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', merged.head)], 'closed-one': [pr(6, 'CLOSED', closed.head)] });
  const res = gh.run(root, 'worktree', 'clean', '--delete-branch', '--force');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!existsSync(merged.path) && !existsSync(closed.path));
  assert.equal(git(root, 'branch', '--list', 'merged-one'), '', 'the merged branch is deleted');
  assert.equal(git(root, 'branch', '--list', 'closed-one'), 'closed-one', 'the closed branch is kept');
  assert.match(git(root, 'ls-remote', '--heads', 'origin', 'merged-one'), /merged-one/, 'the remote branch is untouched');
});

test('worktree_clean_keeps_open_and_no_pr_worktrees_even_with_force', (t) => {
  const { dir, root, base } = repo(t);
  const open = pushedWorktree(root, base, 'open-one');
  const task = join(base, 'task-9-x');
  git(root, 'worktree', 'add', '-q', '-b', 'task/9-x', task, 'main');
  const gh = withFakeGh(dir, { issueStates: { 9: 'CLOSED' } });
  gh.setPrs({ 'open-one': [pr(27, 'OPEN', open.head)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--force', '--json'));
  assert.equal(rows['open-one'].state, 'open');
  assert.equal(rows['open-one'].action, 'keep');
  assert.equal(rows['task/9-x'].state, 'no-pr');
  assert.equal(rows['task/9-x'].action, 'keep');
  assert.equal(rows['task/9-x'].task, 9);
  assert.match(rows['task/9-x'].reason, /issue #9 is closed/);
  assert.match(rows['task/9-x'].reason, /no commits beyond origin\/main/);
  assert.ok(existsSync(open.path) && existsSync(task));
});

test('worktree_clean_removes_a_closed_pr_worktree_only_with_force', (t) => {
  const { dir, root, base } = repo(t);
  const closed = pushedWorktree(root, base, 'closed-one');
  const gh = withFakeGh(dir);
  gh.setPrs({ 'closed-one': [pr(6, 'CLOSED', closed.head)] });
  const plain = gh.run(root, 'worktree', 'clean');
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Skipped:\n.*closed-one.*--force/);
  assert.ok(existsSync(closed.path), 'kept without --force');
  const forced = gh.run(root, 'worktree', 'clean', '--force');
  assert.equal(forced.status, 0, forced.stderr);
  assert.ok(!existsSync(closed.path), 'removed with --force');
  assert.equal(git(root, 'branch', '--list', 'closed-one'), 'closed-one');
});

test('worktree_clean_keeps_dirty_and_unpushed_worktrees_even_with_force', (t) => {
  const { dir, root, base } = repo(t);
  const dirty = pushedWorktree(root, base, 'dirty-one');
  writeFileSync(join(dirty.path, 'draft.md'), 'wip\n');
  const unpushed = pushedWorktree(root, base, 'unpushed-one');
  git(unpushed.path, 'commit', '-q', '--allow-empty', '-m', 'after the merge');
  // The remote branch is gone too, so the PR head is the only record of what was pushed.
  git(root, 'push', '-q', 'origin', '--delete', 'unpushed-one');
  git(root, 'fetch', '-q', '--prune');
  const gh = withFakeGh(dir);
  gh.setPrs({ 'dirty-one': [pr(5, 'MERGED', dirty.head)], 'unpushed-one': [pr(6, 'MERGED', unpushed.head)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--force', '--delete-branch', '--json'));
  assert.deepEqual([rows['dirty-one'].state, rows['dirty-one'].action], ['dirty', 'keep']);
  assert.match(rows['dirty-one'].reason, /uncommitted/);
  assert.deepEqual([rows['unpushed-one'].state, rows['unpushed-one'].action], ['dirty', 'keep']);
  assert.match(rows['unpushed-one'].reason, /not in PR #6/);
  assert.ok(existsSync(dirty.path) && existsSync(unpushed.path));
  assert.equal(git(root, 'branch', '--list', '--format=%(refname:short)', 'unpushed-one'), 'unpushed-one');
});

test('worktree_clean_prunes_a_stale_record', (t) => {
  const { dir, root, base } = repo(t);
  assert.equal(baton(root, 'worktree', 'add', 'gone').status, 0);
  rmSync(join(base, 'gone'), { recursive: true, force: true });
  const rows = cleanRows(withFakeGh(dir).run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows.gone.state, rows.gone.action], ['stale', 'prune']);
  assert.ok(!git(root, 'worktree', 'list', '--porcelain').includes('gone'), 'the stale record is gone');
  assert.equal(git(root, 'branch', '--list', 'gone'), 'gone', 'the branch is kept');
});

test('worktree_clean_dry_run_changes_nothing', (t) => {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  assert.equal(baton(root, 'worktree', 'add', 'gone').status, 0);
  rmSync(join(base, 'gone'), { recursive: true, force: true });
  const gh = withFakeGh(dir);
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', merged.head)] });
  const before = git(root, 'worktree', 'list', '--porcelain');
  const res = gh.run(root, 'worktree', 'clean', '--dry-run', '--delete-branch');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^Would remove:\n/);
  assert.match(res.stdout, /merged-one {2}PR #5 merged; branch would be deleted$/m);
  assert.match(res.stdout, /gone/);
  assert.equal(git(root, 'worktree', 'list', '--porcelain'), before, 'no worktree or record changed');
  assert.ok(existsSync(merged.path));
  assert.equal(git(root, 'branch', '--list', '--format=%(refname:short)', 'merged-one'), 'merged-one');
});

test('worktree_clean_json_rows_have_a_fixed_shape', (t) => {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  const gh = withFakeGh(dir);
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', merged.head)] });
  const res = gh.run(root, 'worktree', 'clean', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout), [
    { branch: 'merged-one', path: merged.path, task: null, pr: 5, state: 'merged', action: 'remove', reason: 'PR #5 merged; branch kept' },
  ]);
});

test('worktree_clean_never_removes_the_current_worktree_or_the_main_checkout', (t) => {
  const { dir, root, base } = repo(t);
  const here = pushedWorktree(root, base, 'here');
  const other = pushedWorktree(root, base, 'other');
  const gh = withFakeGh(dir);
  gh.setPrs({ here: [pr(5, 'MERGED', here.head)], other: [pr(6, 'MERGED', other.head)] });
  const rows = cleanRows(gh.run(here.path, 'worktree', 'clean', '--json'));
  assert.deepEqual(Object.keys(rows).sort(), ['here', 'other'], 'the main checkout is not listed');
  assert.deepEqual([rows.here.state, rows.here.action, rows.here.reason], ['current', 'keep', 'current worktree']);
  assert.ok(existsSync(here.path), 'the current worktree is kept');
  assert.ok(!existsSync(other.path), 'the other merged worktree is removed');
});

test('worktree_clean_fails_and_changes_nothing_when_gh_is_logged_out', (t) => {
  const { dir, root, base } = repo(t);
  pushedWorktree(root, base, 'merged-one');
  assert.equal(baton(root, 'worktree', 'add', 'gone').status, 0);
  rmSync(join(base, 'gone'), { recursive: true, force: true });
  const before = git(root, 'worktree', 'list', '--porcelain');
  const res = withFakeGh(dir, { loggedOut: true }).run(root, 'worktree', 'clean');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /gh auth login/);
  assert.match(res.stderr, /^hint: /m);
  assert.equal(git(root, 'worktree', 'list', '--porcelain'), before, 'nothing changed, not even the stale record');
});

test('worktree_clean_fails_and_changes_nothing_without_gh', (t) => {
  const { dir, root, base } = repo(t);
  pushedWorktree(root, base, 'merged-one');
  // Only git on PATH, so no gh can be found.
  const bin = join(dir, 'git-only');
  mkdirSync(bin);
  symlinkSync(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(), join(bin, 'git'));
  const before = git(root, 'worktree', 'list', '--porcelain');
  const res = spawnSync(process.execPath, [cli, 'worktree', 'clean'], { cwd: root, env: { ...env, PATH: bin }, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /'gh' not found/);
  assert.match(res.stderr, /^hint: /m);
  assert.equal(git(root, 'worktree', 'list', '--porcelain'), before);
});

/** A repo with task worktree #12, task worktree #3 and a named worktree `orgs-spec`. */
function statusRepo(t) {
  const r = repo(t);
  git(r.root, 'worktree', 'add', '-q', '-b', 'task/12-x', join(r.base, 'task-12-x'), 'main');
  git(r.root, 'worktree', 'add', '-q', '-b', 'task/3-y', join(r.base, 'task-3-y'), 'main');
  git(r.root, 'worktree', 'add', '-q', '-b', 'orgs-spec', join(r.base, 'orgs-spec'), 'main');
  git(r.root, 'worktree', 'add', '-q', '-b', 'a-plan', join(r.base, 'zz-plan'), 'main');
  return r;
}

test('status_lists_task_worktrees_first_then_named_and_never_the_main_checkout', (t) => {
  const { root, base } = statusRepo(t);
  const res = baton(root, 'status');
  assert.equal(res.status, 0, res.stderr);
  const lines = res.stdout.split('\n').filter((l) => /^[ *] \S/.test(l));
  assert.deepEqual(lines, ['  #3 task/3-y', '  #12 task/12-x', '  a-plan', '  orgs-spec']);
  assert.ok(res.stdout.includes(join(base, 'orgs-spec')));
  assert.ok(!res.stdout.includes(`${root}\n`) && !/\bmain\b/.test(res.stdout));
});

test('status_json_gives_null_task_for_a_named_worktree', (t) => {
  const { root, base } = statusRepo(t);
  const rows = JSON.parse(baton(root, 'status', '--json').stdout);
  assert.deepEqual(rows.map((r) => r.task), [3, 12, null, null]);
  assert.deepEqual(rows[3], { task: null, branch: 'orgs-spec', path: join(base, 'orgs-spec'), current: false, dirty: false });
});

test('status_marks_the_current_and_uncommitted_worktrees_of_each_kind', (t) => {
  const { root, base } = statusRepo(t);
  writeFileSync(join(base, 'task-12-x', 'new.txt'), 'x');
  writeFileSync(join(base, 'orgs-spec', 'new.txt'), 'x');
  const res = baton(join(base, 'orgs-spec'), 'status');
  const lines = res.stdout.split('\n').filter((l) => /^[ *] \S/.test(l));
  assert.deepEqual(lines, ['  #3 task/3-y', '  #12 task/12-x (uncommitted)', '  a-plan', '* orgs-spec (uncommitted)']);
  const fromTask = baton(join(base, 'task-12-x'), 'status').stdout.split('\n').filter((l) => /^[ *] \S/.test(l));
  assert.ok(fromTask.includes('* #12 task/12-x (uncommitted)'), fromTask.join('\n'));
});

test('status_shows_a_stale_worktree_as_missing_instead_of_failing', (t) => {
  const { root, base } = statusRepo(t);
  rmSync(join(base, 'task-12-x'), { recursive: true });
  rmSync(join(base, 'orgs-spec'), { recursive: true });
  const res = baton(root, 'status');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /#12 task\/12-x \(missing; baton worktree prune\)/);
  assert.match(res.stdout, /orgs-spec \(missing; baton worktree prune\)/);
  assert.equal(JSON.parse(baton(root, 'status', '--json').stdout).find((r) => r.task === 12).dirty, false);
});

test('status_shows_a_detached_worktree_by_path_with_a_null_branch', (t) => {
  const { root, base } = repo(t);
  git(root, 'worktree', 'add', '-q', '--detach', join(base, 'scratch'), 'main');
  const res = baton(root, 'status');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^ {2}\(detached\)$/m);
  assert.ok(res.stdout.includes(join(base, 'scratch')));
  const rows = JSON.parse(baton(root, 'status', '--json').stdout);
  assert.deepEqual(rows.map((r) => [r.task, r.branch]), [[null, null]]);
});

test('status_with_no_linked_worktrees_prints_no_worktrees', (t) => {
  const { root } = repo(t);
  assert.equal(baton(root, 'status').stdout.trim(), 'No worktrees.');
});

test('help_lists_worktree_clean', (t) => {
  const { root } = repo(t);
  const res = baton(root, 'help');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /worktree clean \[--dry-run\] \[--delete-branch\] \[--force\] \[--json\]/);
});

test('worktree_clean_skips_locked_and_detached_worktrees', (t) => {
  const { dir, root, base } = repo(t);
  const locked = pushedWorktree(root, base, 'locked-one');
  git(root, 'worktree', 'lock', locked.path);
  const detached = join(base, 'detached');
  git(root, 'worktree', 'add', '-q', '--detach', detached, 'main');
  const gh = withFakeGh(dir);
  gh.setPrs({ 'locked-one': [pr(5, 'MERGED', locked.head)] });
  const res = gh.run(root, 'worktree', 'clean', '--force', '--json');
  assert.equal(res.status, 0, res.stderr);
  const rows = JSON.parse(res.stdout);
  assert.deepEqual(rows.map((r) => [r.branch, r.state, r.action]), [[null, 'detached', 'skip'], ['locked-one', 'locked', 'skip']]);
  assert.ok(existsSync(locked.path) && existsSync(detached));
});

test('worktree_clean_keeps_a_worktree_whose_pr_head_was_never_fetched', (t) => {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  // A commit added on GitHub (an applied suggestion) that this clone never fetched.
  const unknown = 'deadbeef'.repeat(5);
  const gh = withFakeGh(dir);
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', unknown)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['unverified', 'keep']);
  // The head is missing on the remote too, so the fetch fails and says why.
  assert.ok(rows['merged-one'].reason.startsWith('PR #5 head deadbee not available locally; run `git fetch origin pull/5/head`; fetch failed: '), rows['merged-one'].reason);
  assert.match(rows['merged-one'].reason, /pull\/5\/head$/);
  assert.ok(existsSync(merged.path));
});

/**
 * Worktree `merged-one` whose branch was deleted on origin after a commit was pushed straight to
 * refs/pull/5/head, so a plain `git fetch` never brings it. The commit sits on `from`'s tip.
 */
function prHeadOnlyAtPullRef(t, from) {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  const other = join(dir, 'other');
  git(dir, 'clone', '-q', '-b', from, join(dir, 'origin.git'), other);
  git(other, 'commit', '-q', '--allow-empty', '-m', 'applied suggestion');
  const prHead = git(other, 'rev-parse', 'HEAD');
  git(other, 'push', '-q', 'origin', 'HEAD:refs/pull/5/head');
  git(root, 'push', '-q', 'origin', '--delete', 'merged-one');
  git(root, 'fetch', '-q', '--prune');
  return { root, merged, prHead, gh: withFakeGh(dir) };
}

test('worktree_clean_fetches_a_pr_head_that_exists_only_at_refs_pull', (t) => {
  const { root, merged, prHead, gh } = prHeadOnlyAtPullRef(t, 'merged-one');
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', prHead)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['merged', 'remove']);
  assert.ok(!existsSync(merged.path));
});

test('worktree_clean_dry_run_fetches_a_pr_head_and_updates_no_ref', (t) => {
  const { root, merged, prHead, gh } = prHeadOnlyAtPullRef(t, 'merged-one');
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', prHead)] });
  const refsBefore = git(root, 'for-each-ref');
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--dry-run', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['merged', 'remove']);
  assert.ok(existsSync(merged.path), 'a dry run removes nothing');
  assert.equal(git(root, 'for-each-ref'), refsBefore, 'the fetch updates no ref');
});

test('worktree_clean_keeps_a_worktree_with_commits_missing_from_the_fetched_pr_head', (t) => {
  // refs/pull/5/head grew from main, so the worktree's own commit isn't in it.
  const { root, merged, prHead, gh } = prHeadOnlyAtPullRef(t, 'main');
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', prHead)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['dirty', 'keep']);
  assert.ok(existsSync(merged.path));
});

test('worktree_clean_keeps_a_worktree_whose_pr_head_is_missing_after_a_successful_fetch', (t) => {
  const { root, merged, gh } = prHeadOnlyAtPullRef(t, 'merged-one');
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', 'deadbeef'.repeat(5))] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['unverified', 'keep']);
  assert.equal(rows['merged-one'].reason, 'PR #5 head deadbee not available locally; run `git fetch origin pull/5/head`');
  assert.ok(existsSync(merged.path));
});

test('worktree_clean_does_not_fetch_a_pr_head_that_is_already_local', (t) => {
  const { dir, root, base } = repo(t);
  const merged = pushedWorktree(root, base, 'merged-one');
  // Any fetch from origin runs this upload-pack, which logs the call and fails.
  const fetchLog = join(dir, 'fetch.log');
  const uploadPack = join(dir, 'failing-upload-pack');
  writeFileSync(uploadPack, `#!/bin/sh\necho fetched >> ${JSON.stringify(fetchLog)}\nexit 1\n`);
  chmodSync(uploadPack, 0o755);
  git(root, 'config', 'remote.origin.uploadpack', uploadPack);
  const gh = withFakeGh(dir);
  gh.setPrs({ 'merged-one': [pr(5, 'MERGED', merged.head)] });
  const rows = cleanRows(gh.run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['merged-one'].state, rows['merged-one'].action], ['merged', 'remove']);
  assert.ok(!existsSync(fetchLog), 'no fetch ran');
});

test('worktree_clean_keeps_a_no_pr_task_whose_issue_cannot_be_read', (t) => {
  const { dir, root, base } = repo(t);
  const task = join(base, 'task-999-x');
  git(root, 'worktree', 'add', '-q', '-b', 'task/999-x', task, 'main');
  const rows = cleanRows(withFakeGh(dir, { missingIssues: [999] }).run(root, 'worktree', 'clean', '--json'));
  assert.deepEqual([rows['task/999-x'].state, rows['task/999-x'].action], ['no-pr', 'keep']);
  assert.equal(rows['task/999-x'].reason, 'no PR; no commits beyond origin/main');
});

test('worktree_clean_reports_every_row_when_one_removal_fails', (t) => {
  const { dir, root, base } = repo(t);
  const first = pushedWorktree(root, base, 'a-first');
  assert.equal(baton(root, 'worktree', 'add', 'b-broken').status, 0);
  const broken = join(base, 'b-broken');
  mkdirSync(join(broken, 'locked'));
  writeFileSync(join(broken, 'locked', 'file.txt'), 'x\n');
  git(broken, 'add', '-A');
  git(broken, 'commit', '-qm', 'b-broken');
  git(broken, 'push', '-q', '-u', 'origin', 'b-broken');
  const third = pushedWorktree(root, base, 'c-third');
  const firstTip = git(root, 'rev-parse', '--short', 'a-first');
  const gh = withFakeGh(dir);
  gh.setPrs({
    'a-first': [pr(5, 'MERGED', first.head)],
    'b-broken': [pr(6, 'MERGED', git(broken, 'rev-parse', 'HEAD'))],
    'c-third': [pr(7, 'MERGED', third.head)],
  });
  // A folder git can't empty makes `git worktree remove` fail on this worktree only.
  chmodSync(join(broken, 'locked'), 0o555);
  let res;
  try {
    res = gh.run(root, 'worktree', 'clean', '--delete-branch', '--json');
  } finally {
    chmodSync(join(broken, 'locked'), 0o755);
  }
  assert.equal(res.status, 1, res.stderr);
  const rows = Object.fromEntries(JSON.parse(res.stdout).map((r) => [r.branch, r]));
  assert.deepEqual([rows['a-first'].action, rows['a-first'].reason], ['remove', `PR #5 merged; branch deleted (was ${firstTip})`]);
  assert.equal(rows['b-broken'].action, 'skip');
  assert.match(rows['b-broken'].reason, /^removal failed: /);
  assert.equal(rows['c-third'].action, 'remove', 'later rows still run');
  assert.ok(!existsSync(first.path) && !existsSync(third.path));
  assert.equal(git(root, 'branch', '--list', 'a-first'), '', 'the first branch is deleted');
  assert.equal(git(root, 'branch', '--list', '--format=%(refname:short)', 'b-broken'), 'b-broken', 'the failed one keeps its branch');
});

test('worktree_clean_text_lists_kept_worktrees_and_the_newest_pr_decides', (t) => {
  const { dir, root, base } = repo(t);
  // Reopened as a new PR after an older one merged: the newest (#5, open) decides, even listed first.
  const reopened = pushedWorktree(root, base, 'reopened');
  const task = join(base, 'task-10-y');
  git(root, 'worktree', 'add', '-q', '-b', 'task/10-y', task, 'main');
  git(task, 'commit', '-q', '--allow-empty', '-m', 'work');
  const gh = withFakeGh(dir);
  gh.setPrs({ reopened: [pr(5, 'OPEN', reopened.head), pr(3, 'MERGED', reopened.head)] });
  const res = gh.run(root, 'worktree', 'clean');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, 'Kept:\n  reopened  PR #5 open\n  task/10-y  no PR\n');
  assert.ok(existsSync(reopened.path) && existsSync(task));
});
