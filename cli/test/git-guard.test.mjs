import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardStatus, MANAGER_LINE } from '../lib/git-guard.mjs';

const cli = new URL('../baton.mjs', import.meta.url).pathname;
const template = new URL('../../templates/git-hooks/worktree-guard.sh', import.meta.url).pathname;

// Isolated from the user's git config (signing, hooks), with a fixed identity. GitHub CI sets
// CI=true, and the guard stands down there, so CI and CLAUDE_CODE_REMOTE are removed.
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
delete env.CI;
delete env.CLAUDE_CODE_REMOTE;
// guardStatus runs git in this process, so it needs the same isolation.
Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });

const refusal = (base = 'origin/main') => [
  'baton: commits in the main checkout are refused (hooks.worktreeOnly in .baton/config.json).',
  'Make the change in a linked worktree:',
  '  baton worktree add <name>',
  `  (without baton on PATH: git worktree add --no-track -b <name> ../acme-worktrees/<name> ${base})`,
].join('\n');
const REFUSAL = refusal();

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

function commit(cwd, extraEnv = {}, ...args) {
  return spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'change', ...args], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

function baton(cwd, extraEnv, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

/** A clone of a bare "origin" whose main holds `config` as .baton/config.json (none if null). */
function repo(t, config = {}, { commitIt = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-guard-')));
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
  if (commitIt) {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'init');
    git(root, 'push', '-q', 'origin', 'main');
  }
  return { dir, root };
}

function install(root, ...args) {
  const res = baton(root, {}, 'hooks', 'install', ...args);
  assert.equal(res.status, 0, res.stderr);
  return res;
}

const commonDir = (root) => join(root, '.git');
const scriptPath = (root) => join(commonDir(root), 'baton/worktree-guard.sh');

test('git_guard_refuses_commit_in_main_checkout', (t) => {
  const { root } = repo(t);
  install(root);
  const res = commit(root);
  assert.equal(res.status, 1, res.stderr);
  assert.ok(res.stderr.includes(REFUSAL), res.stderr);
  const amend = commit(root, {}, '--amend');
  assert.equal(amend.status, 1, amend.stderr);
  assert.ok(amend.stderr.includes(REFUSAL), amend.stderr);

  const { root: other } = repo(t, { git: { remote: 'upstream', baseBranch: 'develop' } });
  install(other);
  const custom = commit(other);
  assert.equal(custom.status, 1, custom.stderr);
  assert.ok(custom.stderr.includes(refusal('upstream/develop')), custom.stderr);
});

test('git_guard_allows_linked_worktree', (t) => {
  const { dir, root } = repo(t);
  install(root);
  const wt = join(dir, 'acme-worktrees/docs');
  git(root, 'worktree', 'add', '-q', '-b', 'docs', wt);
  const res = commit(wt);
  assert.equal(res.status, 0, res.stderr);
});

test('git_guard_allows_when_ci_or_no_node_or_unborn', (t) => {
  const { dir, root } = repo(t);
  install(root);
  assert.equal(commit(root, { CI: 'true' }).status, 0);
  assert.equal(commit(root, { CLAUDE_CODE_REMOTE: 'true' }).status, 0);

  // A PATH with git and sh only: the guard can't parse the config, so it lets the commit through.
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(join(git(root, '--exec-path'), 'git'), join(bin, 'git'));
  symlinkSync('/bin/sh', join(bin, 'sh'));
  const noNode = commit(root, { PATH: bin });
  assert.equal(noNode.status, 0, noNode.stderr);
  // The same PATH plus node refuses, so the case above did run the guard.
  symlinkSync(process.execPath, join(bin, 'node'));
  assert.equal(commit(root, { PATH: bin }).status, 1);

  // Unborn branch: the config is staged but HEAD has none, as in the adoption commit.
  const { root: fresh } = repo(t, {}, { commitIt: false });
  install(fresh);
  git(fresh, 'add', '-A');
  const adoption = commit(fresh);
  assert.equal(adoption.status, 0, adoption.stderr);
});

test('git_guard_reads_switch_from_head', (t) => {
  const { root } = repo(t, { hooks: { worktreeOnly: false } });
  install(root);
  assert.equal(commit(root).status, 0);

  // Turning it on in the working tree only does not change what HEAD says.
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: true } }));
  assert.equal(commit(root).status, 0);
  git(root, 'add', '-A');
  assert.equal(commit(root).status, 0, 'the commit that turns it on is allowed: HEAD still says off');
  const refused = commit(root);
  assert.equal(refused.status, 1);
  assert.ok(refused.stderr.includes('commits in the main checkout are refused'), refused.stderr);
});

test('git_guard_allows_without_committed_config', (t) => {
  const { root } = repo(t, null);
  install(root);
  assert.equal(commit(root).status, 0);
});

test('install_writes_stub_into_empty_hooks_dir', (t) => {
  const { root } = repo(t);
  const res = install(root);
  const stub = join(commonDir(root), 'hooks/pre-commit');
  assert.equal(readFileSync(scriptPath(root), 'utf8'), readFileSync(template, 'utf8'));
  assert.equal(readFileSync(scriptPath(root), 'utf8').split('\n')[0], '# baton worktree-guard v1');
  const stubText = readFileSync(stub, 'utf8');
  assert.ok(stubText.includes('# baton:worktree-guard'));
  assert.ok(stubText.includes(MANAGER_LINE));
  assert.ok(statSync(stub).mode & 0o100, 'stub is executable');
  assert.ok(res.stdout.includes(scriptPath(root)) && res.stdout.includes(stub), res.stdout);
  assert.match(res.stdout, /remove/i);
  assert.equal(guardStatus(root), 'installed');

  const json = JSON.parse(install(root, '--json').stdout);
  assert.equal(json.script, scriptPath(root));
  assert.equal(json.stub, stub);
});

test('install_leaves_foreign_hook_untouched', (t) => {
  const { root } = repo(t);
  const hook = join(commonDir(root), 'hooks/pre-commit');
  const foreign = '#!/bin/sh\necho mine\n';
  writeFileSync(hook, foreign, { mode: 0o755 });
  const res = install(root);
  assert.equal(readFileSync(hook, 'utf8'), foreign);
  assert.ok(res.stdout.split('\n').includes(MANAGER_LINE), res.stdout);
  assert.ok(res.stdout.includes(scriptPath(root)), res.stdout);
  assert.match(res.stdout, /remove/i);
  assert.equal(readFileSync(scriptPath(root), 'utf8'), readFileSync(template, 'utf8'));
  assert.equal(guardStatus(root), 'missing', 'not wired until the line is added');
  assert.equal(commit(root).status, 0, 'the foreign hook still runs alone');

  writeFileSync(hook, `${foreign}${MANAGER_LINE}\n`);
  assert.equal(guardStatus(root), 'installed');
  assert.equal(commit(root).status, 1, 'the added line runs the guard');

  const json = JSON.parse(install(root, '--json').stdout);
  assert.equal(json.stub, null);
  assert.equal(json.managerLine, MANAGER_LINE);
});

test('install_respects_core_hooks_path_in_worktree', (t) => {
  for (const dirName of ['.githooks', '.husky']) {
    const { root } = repo(t);
    mkdirSync(join(root, dirName));
    writeFileSync(join(root, dirName, 'commit-msg'), '#!/bin/sh\n', { mode: 0o755 });
    git(root, 'config', 'core.hooksPath', dirName);
    const res = install(root);
    assert.ok(res.stdout.split('\n').includes(MANAGER_LINE), res.stdout);
    assert.deepEqual(spawnSync('/bin/ls', ['-A', join(root, dirName)], { encoding: 'utf8' }).stdout.trim().split('\n'), ['commit-msg'], dirName);
    assert.equal(readFileSync(join(root, dirName, 'commit-msg'), 'utf8'), '#!/bin/sh\n');
    assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), `?? ${dirName}/commit-msg`);
  }
});

test('install_defers_to_hook_manager_config', (t) => {
  const managers = {
    'lefthook.yml': ['lefthook install', '#!/bin/sh\ncall_lefthook run "pre-commit" "$@"\n'],
    '.lefthook.yml': ['lefthook install', '#!/bin/sh\ncall_lefthook run "pre-commit" "$@"\n'],
    '.pre-commit-config.yaml': ['pre-commit install', '#!/usr/bin/env bash\n# File generated by pre-commit: https://pre-commit.com\nexec python -mpre_commit "$@"\n'],
  };
  for (const [file, [installCmd, managerHook]] of Object.entries(managers)) {
    const { root } = repo(t);
    const hook = join(commonDir(root), 'hooks/pre-commit');
    writeFileSync(join(root, file), 'repos: []\n');
    const res = install(root);
    assert.ok(res.stdout.split('\n').includes(MANAGER_LINE), res.stdout);
    assert.ok(res.stdout.includes(file) && res.stdout.includes(installCmd), res.stdout);
    assert.throws(() => statSync(hook), file);
    assert.equal(guardStatus(root), 'missing');

    writeFileSync(join(root, file), `# run: sh "$(git rev-parse --git-common-dir)/baton/worktree-guard.sh"\n`);
    assert.equal(guardStatus(root), 'missing', `${file} mentions the guard but its hook is not installed`);
    writeFileSync(hook, '#!/bin/sh\necho unrelated\n', { mode: 0o755 });
    assert.equal(guardStatus(root), 'missing', `${file}: the installed hook is not the manager's`);
    writeFileSync(hook, managerHook, { mode: 0o755 });
    assert.equal(guardStatus(root), 'installed', file);
  }
});

test('install_points_husky_v9_at_its_own_hook', (t) => {
  const { root } = repo(t);
  mkdirSync(join(root, '.husky/_'), { recursive: true });
  writeFileSync(join(root, '.husky/_/pre-commit'), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n', { mode: 0o755 });
  git(root, 'config', 'core.hooksPath', '.husky/_');
  const res = install(root);
  assert.ok(res.stdout.split('\n').includes(MANAGER_LINE), res.stdout);
  assert.ok(res.stdout.includes(join(root, '.husky/pre-commit')), res.stdout);
  assert.equal(guardStatus(root), 'missing');
  writeFileSync(join(root, '.husky/pre-commit'), `${MANAGER_LINE}\n`);
  assert.equal(guardStatus(root), 'installed');
});

test('install_keeps_lines_added_to_the_stub', (t) => {
  const { root } = repo(t);
  install(root);
  const stub = join(commonDir(root), 'hooks/pre-commit');
  const edited = `${readFileSync(stub, 'utf8')}gitleaks protect --staged || exit 1\n`;
  writeFileSync(stub, edited);
  const res = install(root);
  assert.equal(readFileSync(stub, 'utf8'), edited);
  assert.match(res.stdout, /not written by baton|other lines/);
  assert.equal(guardStatus(root), 'installed');
});

test('install_is_idempotent', (t) => {
  const { root } = repo(t);
  install(root);
  const stub = join(commonDir(root), 'hooks/pre-commit');
  const before = [readFileSync(scriptPath(root), 'utf8'), readFileSync(stub, 'utf8')];
  writeFileSync(scriptPath(root), '# baton worktree-guard v0\nexit 0\n');
  const second = install(root);
  assert.deepEqual([readFileSync(scriptPath(root), 'utf8'), readFileSync(stub, 'utf8')], before);
  assert.ok(second.stdout.includes(stub), second.stdout);
  assert.equal(guardStatus(root), 'installed');
  assert.equal(commit(root).status, 1);
  assert.match(install(root).stdout, /already installed; behavior is unchanged/);
});

test('guardStatus_detects_outdated_script', (t) => {
  const { root } = repo(t);
  assert.equal(guardStatus(root), 'missing');
  install(root);
  writeFileSync(scriptPath(root), `${readFileSync(template, 'utf8')}# local edit\n`);
  assert.equal(guardStatus(root), 'outdated');
  rmSync(scriptPath(root));
  assert.equal(guardStatus(root), 'missing');
});

test('doctor_reports_missing_guard_only_when_on', (t) => {
  const findings = (root, extraEnv = {}) => {
    const res = baton(root, extraEnv, 'doctor', '--json');
    return { status: res.status, kinds: JSON.parse(res.stdout).filter((f) => f.kind === 'worktree') };
  };

  const { root } = repo(t);
  const missing = findings(root);
  assert.equal(missing.status, 1);
  assert.equal(missing.kinds.length, 1);
  assert.match(missing.kinds[0].message, /missing.*run `baton hooks install`/);

  install(root);
  assert.deepEqual(findings(root).kinds, []);
  writeFileSync(scriptPath(root), '# baton worktree-guard v0\n');
  assert.match(findings(root).kinds[0].message, /outdated.*run `baton hooks install`/);
  install(root);

  git(root, 'checkout', '-qb', 'elsewhere');
  const offBase = findings(root).kinds;
  assert.equal(offBase.length, 1);
  assert.match(offBase[0].message, /main checkout .* is on elsewhere, not main/);
  git(root, 'checkout', '-q', 'main');

  rmSync(scriptPath(root));
  git(root, 'checkout', '-qb', 'elsewhere-again');
  assert.deepEqual(findings(root, { CI: 'true' }).kinds, []);
  assert.deepEqual(findings(root, { CLAUDE_CODE_REMOTE: 'true' }).kinds, []);

  git(root, 'checkout', '-q', 'main');
  install(root);
  git(root, 'checkout', '-q', '--detach');
  assert.match(findings(root).kinds[0].message, /is on a detached HEAD, not main/);

  const { root: off } = repo(t, { hooks: { worktreeOnly: false } });
  git(off, 'checkout', '-qb', 'elsewhere');
  assert.deepEqual(findings(off).kinds, []);

  const { root: none } = repo(t, null);
  git(none, 'checkout', '-qb', 'elsewhere');
  assert.deepEqual(findings(none).kinds, []);
});

test('doctor_has_no_main_checkout_in_a_bare_repo', (t) => {
  const { dir } = repo(t);
  const wt = join(dir, 'feat');
  git(join(dir, 'origin.git'), 'worktree', 'add', '-q', '-b', 'feat', wt);
  const res = baton(wt, {}, 'doctor', '--json');
  assert.deepEqual(JSON.parse(res.stdout).filter((f) => f.kind === 'worktree'), [], res.stdout);
  const ctx = baton(wt, {}, 'context');
  assert.ok(!ctx.stdout.includes('baton hooks install'), ctx.stdout);
});
