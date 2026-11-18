import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { COMMIT_GATES_LINE, COMMIT_GATES_PATH, commitGatesStatus, guardStatus, MANAGER_LINE } from '../lib/git-guard.mjs';

const cli = new URL('../baton.mjs', import.meta.url).pathname;
const template = new URL('../../templates/git-hooks/worktree-guard.sh', import.meta.url).pathname;
const gatesTemplate = new URL('../../templates/git-hooks/commit-gates.sh', import.meta.url).pathname;

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

const refusal = (base = 'origin/main') =>
  [
    'baton: commits in the main checkout are refused (hooks.worktreeOnly in .baton/config.json).',
    'Make the change in a linked worktree:',
    '  baton worktree add <name>',
    `  (without baton on PATH: git worktree add --no-track -b <name> .worktrees/<name> ${base})`,
  ].join('\n');
const REFUSAL = refusal();
/** The refusal for a commit in the linked worktree `wt`, outside `<root>/.worktrees/`. */
const outsideRefusal = (wt, root) =>
  [
    `baton: this worktree is outside .worktrees/ (${wt}).`,
    `Every worktree lives in ${root}/.worktrees/. Move it with:`,
    `  git worktree move ${wt} ${root}/.worktrees/${basename(wt)}`,
  ].join('\n');

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
const gatesPath = (root) => join(commonDir(root), COMMIT_GATES_PATH);
const BOTH_LINES = `${MANAGER_LINE}\n${COMMIT_GATES_LINE}`;
const INSTALL_HINT = 'npm install -g @jcioriente/baton';
const UPGRADE_HINT = 'npm install -g @jcioriente/baton@latest';
// The stub `baton hooks install` wrote in 0.7.0, before commit gates.
const STUB_0_7_0 = `#!/bin/sh
# baton:worktree-guard
# Written by \`baton hooks install\`. Delete this file to remove the hook.
${MANAGER_LINE}
`;

// The head of the guard `baton hooks install` wrote before worktrees moved into .worktrees/.
const GUARD_V1 = `# baton worktree-guard v1
# Refuses commits in the main checkout while hooks.worktreeOnly is on in the committed
# .baton/config.json. Installed by \`baton hooks install\`, which rewrites this file on every run.
[ "$CI" = true ] && exit 0
`;

/**
 * A PATH whose first entry holds a fake `baton` running `body`, standing in for the CLI. The fake
 * records its arguments and working directory in `<dir>/baton-calls`.
 */
function fakeBaton(dir, body) {
  const bin = mkdtempSync(join(dir, 'fake-baton-'));
  const calls = join(dir, 'baton-calls');
  writeFileSync(join(bin, 'baton'), `#!/bin/sh\necho "$* @ $(pwd)" >> '${calls}'\n${body}\n`, { mode: 0o755 });
  return { PATH: `${bin}:${env.PATH}` };
}
const PASSING = 'echo "✔ lint" >&2; exit 0';
const FAILING = 'echo "✖ lint failed (exit 1)" >&2; exit 1';
// What a baton older than `--stage` prints: `opts` in cli/baton.mjs turns parseArgs' error into this.
// Before 0.6.0, the parseArgs error escaped as an unexpected error with its stack.
const TOO_OLD_PRE_0_6 =
  "printf '%s\\n' 'baton: unexpected error' \"TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--stage'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \\\"--stage\\\"\" '    at parseArgs (node:internal/util/parse_args/parse_args:1:1)' >&2; exit 2";
const TOO_OLD = "printf '%s\\n' \"baton: Unknown option '--stage'\" 'hint: Run `baton help`.' >&2; exit 1";

/** An installed repo and a linked worktree of it, inside `.worktrees/`. */
function linked(t, config = {}) {
  const { dir, root } = repo(t, config);
  install(root);
  const wt = join(root, '.worktrees/feat');
  git(root, 'worktree', 'add', '-q', '-b', 'feat', wt);
  return { dir, root, wt };
}

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
  const wt = join(root, '.worktrees/docs');
  git(root, 'worktree', 'add', '-q', '-b', 'docs', wt);
  const res = commit(wt, fakeBaton(dir, PASSING));
  assert.equal(res.status, 0, res.stderr);
});

/** Runs the installed guard script alone (no commit gates) in `cwd`. */
function runGuard(script, cwd, extraEnv = {}) {
  return spawnSync('sh', [script], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

test('git guard refuses a commit in a worktree outside .worktrees', (t) => {
  const { dir, root } = repo(t);
  install(root);
  const passing = fakeBaton(dir, PASSING);
  for (const outside of [join(dir, 'acme-worktrees/old'), join(root, '.claude/worktrees/x')]) {
    git(root, 'worktree', 'add', '-q', '-b', basename(outside), outside);
    const res = commit(outside, passing);
    assert.equal(res.status, 1, res.stderr);
    assert.ok(res.stderr.includes(outsideRefusal(outside, root)), res.stderr);
  }
  assert.throws(() => statSync(join(dir, 'baton-calls')), 'the guard refuses before the commit gates run');

  for (const [branch, inside] of [
    ['feat', join(root, '.worktrees/feat')],
    ['ab', join(root, '.worktrees/a/b')],
    ['dots', join(root, '.worktrees/..x')],
  ]) {
    git(root, 'worktree', 'add', '-q', '-b', branch, inside);
    const res = commit(inside, passing);
    assert.equal(res.status, 0, res.stderr);
  }
  // Inside compares real paths: a worktree reached through a symlinked repo path is still inside.
  const link = join(dir, 'link');
  symlinkSync(root, link);
  const res = commit(join(link, '.worktrees/feat'), passing);
  assert.equal(res.status, 0, res.stderr);

  // A .worktrees that is a symlink holds its worktrees at the real folder it points to.
  const { dir: dir2, root: root2 } = repo(t);
  install(root2);
  mkdirSync(join(dir2, 'elsewhere'));
  symlinkSync(join(dir2, 'elsewhere'), join(root2, '.worktrees'));
  git(root2, 'worktree', 'add', '-q', '-b', 'feat', join(root2, '.worktrees/feat'));
  const viaLink = commit(join(dir2, 'elsewhere/feat'), fakeBaton(dir2, PASSING));
  assert.equal(viaLink.status, 0, viaLink.stderr);
});

test('git guard reads worktreeOnly from the main checkout HEAD', (t) => {
  // The branch says on, the main checkout says off: allowed.
  const { dir, root } = repo(t, { hooks: { worktreeOnly: true } });
  git(root, 'branch', 'on');
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: false } }));
  git(root, 'commit', '-qam', 'off');
  install(root);
  const passing = fakeBaton(dir, PASSING);
  const onBranch = join(dir, 'acme-worktrees/on');
  git(root, 'worktree', 'add', '-q', onBranch, 'on');
  const allowed = commit(onBranch, passing);
  assert.equal(allowed.status, 0, allowed.stderr);

  // The branch says off, the main checkout says on: refused.
  const { dir: dir2, root: root2 } = repo(t, { hooks: { worktreeOnly: false } });
  git(root2, 'branch', 'off');
  writeFileSync(join(root2, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: true } }));
  git(root2, 'commit', '-qam', 'on');
  install(root2);
  const offBranch = join(dir2, 'acme-worktrees/off');
  git(root2, 'worktree', 'add', '-q', offBranch, 'off');
  const refused = commit(offBranch, fakeBaton(dir2, PASSING));
  assert.equal(refused.status, 1, refused.stderr);
  assert.ok(refused.stderr.includes(outsideRefusal(offBranch, root2)), refused.stderr);
});

test('git guard skips the outside check without a main checkout', (t) => {
  // A bare repository: every worktree is linked, and there is no main checkout to hold them.
  const { dir } = repo(t);
  const bareWt = join(dir, 'feat');
  git(join(dir, 'origin.git'), 'worktree', 'add', '-q', '-b', 'feat', bareWt);
  install(bareWt);
  const bare = commit(bareWt, fakeBaton(dir, PASSING));
  assert.equal(bare.status, 0, bare.stderr);

  // A separate git dir: the common dir isn't `<checkout>/.git`.
  const sepDir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-guard-')));
  t.after(() => rmSync(sepDir, { recursive: true, force: true }));
  const proj = join(sepDir, 'proj');
  git(sepDir, 'init', '-q', '-b', 'main', '--separate-git-dir', join(sepDir, 'sep.git'), proj);
  mkdirSync(join(proj, '.baton'));
  writeFileSync(join(proj, '.baton/config.json'), '{}');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-qm', 'init');
  install(proj);
  const sepWt = join(sepDir, 'proj-wt');
  git(proj, 'worktree', 'add', '-q', '-b', 'feat', sepWt);
  const sep = commit(sepWt, fakeBaton(sepDir, PASSING));
  assert.equal(sep.status, 0, sep.stderr);
});

test('git guard allows an outside worktree in CI, cloud sessions and on errors', (t) => {
  const { dir, root } = repo(t);
  install(root);
  const outside = join(dir, 'acme-worktrees/old');
  git(root, 'worktree', 'add', '-q', '-b', 'old', outside);
  const passing = fakeBaton(dir, PASSING);
  assert.equal(commit(outside, { ...passing, CI: 'true' }).status, 0);
  assert.equal(commit(outside, { ...passing, CLAUDE_CODE_REMOTE: 'true' }).status, 0);

  // Without node the guard can't read the config, so it lets the commit through.
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(join(git(root, '--exec-path'), 'git'), join(bin, 'git'));
  symlinkSync('/bin/sh', join(bin, 'sh'));
  assert.equal(runGuard(scriptPath(root), outside, { PATH: bin }).status, 0);
  // The same PATH plus node refuses, so the case above did run the guard.
  symlinkSync(process.execPath, join(bin, 'node'));
  assert.equal(runGuard(scriptPath(root), outside, { PATH: bin }).status, 1);

  // An unparseable config at the main checkout's HEAD fails open.
  writeFileSync(join(root, '.baton/config.json'), '{not json');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qam', 'broken');
  assert.equal(runGuard(scriptPath(root), outside).status, 0);
});

test('commit in a linked worktree fails on a failing blocking commit step', (t) => {
  const { dir, wt } = linked(t);
  const res = commit(wt, fakeBaton(dir, FAILING));
  assert.equal(res.status, 1, res.stderr);
  assert.ok(res.stderr.includes('✖ lint failed (exit 1)'), res.stderr);
  assert.equal(readFileSync(join(dir, 'baton-calls'), 'utf8'), `verify --stage commit @ ${wt}\n`);
});

test('commit passes when only an advisory commit step fails', (t) => {
  // verify exits 0 when only advisory steps fail; the script trusts its exit status.
  const { dir, wt } = linked(t);
  const res = commit(wt, fakeBaton(dir, 'echo "✖ lint failed (exit 1, advisory)" >&2; exit 0'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stderr.includes('advisory'), res.stderr);
});

test('commit passes when there are no commit steps', (t) => {
  const { dir, wt } = linked(t);
  const res = commit(wt, fakeBaton(dir, 'echo "No validation steps in stage \'commit\'." >&2'));
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(join(dir, 'baton-calls'), 'utf8'), `verify --stage commit @ ${wt}\n`);
});

test('commit fails with the install hint when baton is not on PATH', (t) => {
  const { dir, wt } = linked(t);
  // git, sh and node only: the worktree guard still runs, and there is no baton to find.
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(join(git(wt, '--exec-path'), 'git'), join(bin, 'git'));
  symlinkSync('/bin/sh', join(bin, 'sh'));
  symlinkSync(process.execPath, join(bin, 'node'));
  const res = commit(wt, { PATH: bin });
  assert.equal(res.status, 1, res.stderr);
  assert.ok(res.stderr.includes(INSTALL_HINT), res.stderr);
  assert.ok(!res.stderr.includes(UPGRADE_HINT), res.stderr);
});

test('commit fails with the upgrade hint when baton rejects --stage', (t) => {
  const { dir, wt } = linked(t);
  const res = commit(wt, fakeBaton(dir, TOO_OLD));
  assert.equal(res.status, 1, res.stderr);
  assert.ok(res.stderr.includes(UPGRADE_HINT), res.stderr);
  const older = commit(wt, fakeBaton(dir, TOO_OLD_PRE_0_6));
  assert.equal(older.status, 1, older.stderr);
  assert.ok(older.stderr.includes(UPGRADE_HINT), older.stderr);

  // A step whose own output mentions the option is a plain failure, not an old baton.
  const step = commit(wt, fakeBaton(dir, 'echo "lint: Unknown option \'--stage\'" >&2; exit 1'));
  assert.equal(step.status, 1, step.stderr);
  assert.ok(!step.stderr.includes(UPGRADE_HINT), step.stderr);
});

test('commit gates stand down in a worktree without a baton config', (t) => {
  // A branch from before the repo adopted baton: no .baton/config.json in its checkout.
  const { dir, root } = repo(t);
  install(root);
  git(root, 'checkout', '-q', '--orphan', 'old');
  git(root, 'rm', '-rq', '--cached', '.baton');
  rmSync(join(root, '.baton'), { recursive: true });
  git(root, 'commit', '-qm', 'before baton');
  git(root, 'checkout', '-q', 'main');
  const wt = join(root, '.worktrees/old');
  git(root, 'worktree', 'add', '-q', wt, 'old');
  const res = commit(wt, fakeBaton(dir, FAILING));
  assert.equal(res.status, 0, res.stderr);
  assert.throws(() => statSync(join(dir, 'baton-calls')), 'baton is not run without a config');

  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(join(git(wt, '--exec-path'), 'git'), join(bin, 'git'));
  symlinkSync('/bin/sh', join(bin, 'sh'));
  const noBaton = commit(wt, { PATH: bin });
  assert.equal(noBaton.status, 0, noBaton.stderr);
});

test('commit gates stand down in CI and in the main checkout', (t) => {
  const { dir, wt } = linked(t);
  const failing = fakeBaton(dir, FAILING);
  assert.equal(commit(wt, { ...failing, CI: 'true' }).status, 0);

  // In the main checkout the guard decides: off here, so the commit goes through without baton.
  const { dir: offDir, root: off } = repo(t, { hooks: { worktreeOnly: false } });
  install(off);
  const res = commit(off, fakeBaton(offDir, FAILING));
  assert.equal(res.status, 0, res.stderr);
  assert.throws(() => statSync(join(offDir, 'baton-calls')), 'baton is not run in the main checkout');
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
  assert.equal(readFileSync(scriptPath(root), 'utf8').split('\n')[0], '# baton worktree-guard v2');
  const stubText = readFileSync(stub, 'utf8');
  assert.ok(stubText.includes('# baton:worktree-guard'));
  assert.ok(stubText.includes(MANAGER_LINE));
  assert.ok(stubText.indexOf(COMMIT_GATES_LINE) > stubText.indexOf(MANAGER_LINE), 'commit gates run after the guard');
  assert.equal(readFileSync(gatesPath(root), 'utf8'), readFileSync(gatesTemplate, 'utf8'));
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
  assert.ok(res.stdout.includes(BOTH_LINES), res.stdout);
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
  assert.equal(json.managerLine, BOTH_LINES);
});

test('install_respects_core_hooks_path_in_worktree', (t) => {
  for (const dirName of ['.githooks', '.husky']) {
    const { root } = repo(t);
    mkdirSync(join(root, dirName));
    writeFileSync(join(root, dirName, 'commit-msg'), '#!/bin/sh\n', { mode: 0o755 });
    git(root, 'config', 'core.hooksPath', dirName);
    const res = install(root);
    assert.ok(res.stdout.includes(BOTH_LINES), res.stdout);
    assert.deepEqual(
      spawnSync('/bin/ls', ['-A', join(root, dirName)], { encoding: 'utf8' })
        .stdout.trim()
        .split('\n'),
      ['commit-msg'],
      dirName,
    );
    assert.equal(readFileSync(join(root, dirName, 'commit-msg'), 'utf8'), '#!/bin/sh\n');
    assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), `?? ${dirName}/commit-msg`);
  }
});

test('install_defers_to_hook_manager_config', (t) => {
  const managers = {
    'lefthook.yml': ['lefthook install', '#!/bin/sh\ncall_lefthook run "pre-commit" "$@"\n'],
    '.lefthook.yml': ['lefthook install', '#!/bin/sh\ncall_lefthook run "pre-commit" "$@"\n'],
    '.pre-commit-config.yaml': [
      'pre-commit install',
      '#!/usr/bin/env bash\n# File generated by pre-commit: https://pre-commit.com\nexec python -mpre_commit "$@"\n',
    ],
  };
  for (const [file, [installCmd, managerHook]] of Object.entries(managers)) {
    const { root } = repo(t);
    const hook = join(commonDir(root), 'hooks/pre-commit');
    writeFileSync(join(root, file), 'repos: []\n');
    const res = install(root);
    assert.ok(res.stdout.includes(BOTH_LINES), res.stdout);
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
  assert.ok(res.stdout.includes(BOTH_LINES), res.stdout);
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

test('install rewrites a 0.7.0 stub', (t) => {
  const { root } = repo(t);
  const stub = join(commonDir(root), 'hooks/pre-commit');
  mkdirSync(dirname(stub), { recursive: true });
  writeFileSync(stub, STUB_0_7_0, { mode: 0o755 });
  const res = install(root);
  assert.ok(res.stdout.includes(`Wrote ${stub}`), res.stdout);
  assert.ok(readFileSync(stub, 'utf8').includes(COMMIT_GATES_LINE));

  // A 0.7.0 stub with a user's line is still left alone.
  const edited = `${STUB_0_7_0}gitleaks protect --staged || exit 1\n`;
  writeFileSync(stub, edited);
  assert.match(install(root).stdout, /other lines/);
  assert.equal(readFileSync(stub, 'utf8'), edited);
});

test('commitGatesStatus is missing when the stub lacks commit-gates', (t) => {
  const { root } = repo(t);
  const config = { validate: [{ name: 'lint', run: 'make lint', stages: ['commit', 'local'] }] };
  assert.equal(commitGatesStatus(root, config), 'missing', 'nothing installed');
  const stub = join(commonDir(root), 'hooks/pre-commit');
  mkdirSync(dirname(stub), { recursive: true });
  writeFileSync(stub, STUB_0_7_0, { mode: 0o755 });
  assert.equal(commitGatesStatus(root, config), 'missing', 'a 0.7.0 stub');
  install(root);
  assert.equal(commitGatesStatus(root, config), 'installed');
  rmSync(gatesPath(root));
  assert.equal(commitGatesStatus(root, config), 'missing', 'the stub calls a script that is gone');
});

test('commitGatesStatus is not-needed without a commit step', (t) => {
  const { root } = repo(t);
  assert.equal(commitGatesStatus(root, {}), 'not-needed');
  assert.equal(commitGatesStatus(root, { validate: [{ name: 'ci', run: 'make ci' }] }), 'not-needed');
  assert.equal(commitGatesStatus(root, { validate: [{ name: 'ci', run: 'make ci', stages: ['local', 'ci'] }] }), 'not-needed');
  // An unvalidated config: stages that aren't an array name no commit stage.
  assert.equal(commitGatesStatus(root, { validate: [{ name: 'ci', run: 'make ci', stages: 'precommit' }] }), 'not-needed');
  assert.equal(commitGatesStatus(root, { validate: [{ name: 'ci', run: 'make ci', stages: { commit: true } }] }), 'not-needed');
});

test('commitGatesStatus follows a hook manager config and husky', (t) => {
  const config = { validate: [{ name: 'lint', run: 'make lint', stages: ['commit'] }] };
  const { root } = repo(t);
  writeFileSync(join(root, 'lefthook.yml'), `pre-commit:\n  commands:\n    guard:\n      run: ${MANAGER_LINE}\n`);
  install(root);
  writeFileSync(join(commonDir(root), 'hooks/pre-commit'), '#!/bin/sh\ncall_lefthook run "pre-commit" "$@"\n', { mode: 0o755 });
  assert.equal(commitGatesStatus(root, config), 'missing', 'the manager runs the guard only');
  writeFileSync(join(root, 'lefthook.yml'), `pre-commit:\n  commands:\n    gates:\n      run: ${COMMIT_GATES_LINE}\n`);
  assert.equal(commitGatesStatus(root, config), 'installed');

  const { root: husky } = repo(t);
  mkdirSync(join(husky, '.husky/_'), { recursive: true });
  git(husky, 'config', 'core.hooksPath', '.husky/_');
  install(husky);
  assert.equal(commitGatesStatus(husky, config), 'missing');
  writeFileSync(join(husky, '.husky/pre-commit'), `${BOTH_LINES}\n`);
  assert.equal(commitGatesStatus(husky, config), 'installed');
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

test('install rewrites a stale commit-gates script', (t) => {
  const { root } = repo(t);
  const first = JSON.parse(install(root, '--json').stdout);
  assert.equal(first.gates, gatesPath(root));
  writeFileSync(gatesPath(root), '# baton commit-gates v0\nexit 0\n');
  const res = install(root);
  assert.equal(readFileSync(gatesPath(root), 'utf8'), readFileSync(gatesTemplate, 'utf8'));
  assert.doesNotMatch(res.stdout, /already installed; behavior is unchanged/);
  assert.match(install(root).stdout, /already installed; behavior is unchanged/);
});

test('install rewrites a v1 guard script, which guardStatus calls outdated', (t) => {
  const { root } = repo(t);
  install(root);
  writeFileSync(scriptPath(root), GUARD_V1);
  assert.equal(guardStatus(root), 'outdated');
  assert.doesNotMatch(install(root).stdout, /already installed; behavior is unchanged/);
  assert.equal(readFileSync(scriptPath(root), 'utf8'), readFileSync(template, 'utf8'));
  assert.equal(guardStatus(root), 'installed');
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
  assert.deepEqual(
    JSON.parse(res.stdout).filter((f) => f.kind === 'worktree'),
    [],
    res.stdout,
  );
  const ctx = baton(wt, {}, 'context');
  assert.ok(!ctx.stdout.includes('baton hooks install'), ctx.stdout);
});

test('commit gates in a linked worktree run its own commit steps', (t) => {
  // Main's commit step fails; the branch replaces it with a passing one. The real CLI runs them.
  const failing = { name: 'main-step', run: 'exit 1', stages: ['commit'] };
  const { dir, wt } = linked(t, { validate: [failing] });
  writeFileSync(join(wt, '.baton/config.json'), JSON.stringify({ validate: [{ name: 'branch-step', run: 'true', stages: ['commit'] }] }));
  const bin = mkdtempSync(join(dir, 'real-baton-'));
  writeFileSync(join(bin, 'baton'), `#!/bin/sh\nexec '${process.execPath}' '${cli}' "$@"\n`, { mode: 0o755 });
  const res = commit(wt, { PATH: `${bin}:${env.PATH}` });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /✔ branch-step/);
  assert.doesNotMatch(res.stderr, /main-step/);
});
