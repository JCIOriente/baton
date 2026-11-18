import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decide, denyText, outsideDenyText } from '../../hooks/worktree-guard.mjs';

const hook = new URL('../../hooks/worktree-guard.mjs', import.meta.url).pathname;

// Isolated from the user's git config, with a fixed identity. CI and CLAUDE_CODE_REMOTE are
// removed so the guard is active in the child even when the parent runs in CI.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
delete env.CI;
delete env.CLAUDE_CODE_REMOTE;

function git(cwd, ...args) {
  const res = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

/** Runs the hook with `input` on stdin (a string is sent as is) and returns its exit result. */
function spawnHook(input, extraEnv = {}) {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  const res = spawnSync(process.execPath, [hook], { input: stdin, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  return res;
}

/** Runs the hook with `input` on stdin and returns its stdout. */
function runHook(input, extraEnv = {}) {
  return spawnHook(input, extraEnv).stdout;
}

function denialReason(stdout) {
  const out = JSON.parse(stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  return out.permissionDecisionReason;
}

/**
 * A repo whose HEAD holds `config` as .baton/config.json (none if null; a string is written
 * as is), with a gitignored `.env` and three linked worktrees: `inside` at `.worktrees/docs`
 * (not gitignored, so only the folder decides), and two outside `.worktrees/`: a `sibling`
 * and one `nested` at `.claude/worktrees/x` (gitignored in the main checkout).
 */
function repo(t, config = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-guard-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'acme');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'README.md'), 'acme\n');
  writeFileSync(join(root, '.gitignore'), '.env\n.claude/worktrees/\n');
  if (config) {
    mkdirSync(join(root, '.baton'));
    writeFileSync(join(root, '.baton/config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  const sibling = join(dir, 'acme-worktrees', 'docs');
  git(root, 'worktree', 'add', '-q', '-b', 'docs', sibling);
  const nested = join(root, '.claude', 'worktrees', 'x');
  git(root, 'worktree', 'add', '-q', '-b', 'x', nested);
  const inside = join(root, '.worktrees', 'docs');
  git(root, 'worktree', 'add', '-q', '-b', 'inside', inside);
  return { dir, root, sibling, nested, inside };
}

const on = { hooks: { worktreeOnly: true } };
const main = { gitDir: '/r/acme/.git', commonDir: '/r/acme/.git', top: '/r/acme', mainTop: '/r/acme', path: '/r/acme/docs/a.md', ignored: false, config: on, env: {} };
/** An edit in the linked worktree whose top-level folder is `top`. */
const linkedAt = (top) => ({ ...main, gitDir: '/r/acme/.git/worktrees/w', top, path: `${top}/docs/a.md` });

// --- decide (pure) ---

test('decide_allows_linked_worktree_inside_worktrees', () => {
  assert.equal(decide(linkedAt('/r/acme/.worktrees/docs')), null);
  assert.equal(decide(linkedAt('/r/acme/.worktrees/a/b')), null, 'nested');
  assert.equal(decide(linkedAt('/r/acme/.worktrees/..x')), null, 'a name starting with two dots');
});

test('decide_denies_linked_worktree_outside_worktrees', () => {
  const reason = decide(linkedAt('/r/acme-worktrees/docs'));
  assert.equal(reason, outsideDenyText('docs/a.md', '/r/acme-worktrees/docs', '/r/acme'));
  assert.equal(
    reason,
    [
      'baton: docs/a.md is in a worktree outside .worktrees/ (/r/acme-worktrees/docs).',
      'Every worktree lives in /r/acme/.worktrees/.',
      '- Task work: `baton start <n>`, then edit inside the printed path.',
      '- Anything else: `baton worktree add <name>`, then edit there.',
    ].join('\n'),
  );
  assert.notEqual(decide(linkedAt('/r/acme/.claude/worktrees/x')), null, "Claude Code's worktree folder");
  assert.notEqual(decide(linkedAt('/r/acme/.worktreesx/docs')), null, 'a folder named like it');
  assert.notEqual(decide({ ...linkedAt('/r/acme-worktrees/docs'), config: { project: 'acme' } }), null, 'no key means on');

  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), mainTop: null }), null, 'no main checkout');
  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), ignored: true }), null, 'gitignored');
  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), config: { hooks: { worktreeOnly: false } } }), null, 'off');
  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), config: null }), null, 'no committed config');
  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), env: { CI: 'true' } }), null, 'CI');
  assert.equal(decide({ ...linkedAt('/r/acme-worktrees/docs'), env: { CLAUDE_CODE_REMOTE: 'true' } }), null, 'cloud');
});

test('decide_denies_main_checkout', () => {
  const reason = decide(main);
  assert.equal(reason, denyText('docs/a.md', '/r/acme'));
  assert.ok(reason.startsWith('baton: docs/a.md is in the main checkout (/r/acme).\n'), reason);
  assert.ok(reason.includes('`baton start <n>`'));
  assert.ok(reason.includes('`baton worktree add <name>`'));
  assert.ok(reason.includes('("hooks": { "worktreeOnly": false } in .baton/config.json, merged to the base branch).'));
  // A committed config without the key means on.
  assert.equal(decide({ ...main, config: { project: 'acme' } }), reason);
  assert.equal(decide({ ...main, config: { hooks: { factGate: true } } }), reason);
});

test('decide_allows_ignored_path', () => {
  assert.equal(decide({ ...main, path: '/r/acme/.env', ignored: true }), null);
});

test('decide_allows_without_committed_config', () => {
  assert.equal(decide({ ...main, config: null }), null, 'absent or unparseable');
  assert.equal(decide({ ...main, config: 'oops' }), null, 'not an object');
  assert.equal(decide({ ...main, config: [1] }), null, 'an array');
  assert.equal(decide({ ...main, config: { hooks: { worktreeOnly: 'false' } } }), null, 'non-boolean switch');
  assert.equal(decide({ ...main, config: { hooks: { worktreeOnly: 0 } } }), null, 'numeric switch');
  assert.equal(decide({ ...main, config: { hooks: 'x' } }), null, 'hooks not an object');
  assert.equal(decide({ ...main, config: { hooks: [] } }), null, 'hooks an array');
  assert.equal(decide({ ...main, config: { hooks: null } }), null, 'hooks null');
});

test('decide_reads_switch_from_head_not_worktree', () => {
  assert.equal(decide({ ...main, config: { hooks: { worktreeOnly: false } } }), null);
  assert.notEqual(decide({ ...main, config: { hooks: { worktreeOnly: true } } }), null);
});

test('decide_allows_on_git_failure', () => {
  assert.equal(decide({ ...main, gitDir: null, commonDir: null, top: null }), null);
});

test('decide_stands_down_in_ci_and_cloud', () => {
  assert.equal(decide({ ...main, env: { CI: 'true' } }), null);
  assert.equal(decide({ ...main, env: { CLAUDE_CODE_REMOTE: 'true' } }), null);
  assert.notEqual(decide({ ...main, env: { CI: 'false' } }), null);
});

// --- hook integration ---

test('hook_denies_main_checkout_edit', (t) => {
  const { root, inside } = repo(t);
  const edit = (cwd, file_path) => runHook({ tool_name: 'Edit', cwd, tool_input: { file_path } });
  assert.equal(denialReason(edit(root, join(root, 'README.md'))), denyText('README.md', root));
  assert.equal(denialReason(edit(root, 'README.md')), denyText('README.md', root), 'relative to cwd');
  // The edited file's directory picks the checkout, not the session cwd.
  assert.equal(denialReason(edit(inside, join(root, 'README.md'))), denyText('README.md', root));
});

test('edit guard allows edits inside .worktrees', (t) => {
  const { root, inside } = repo(t);
  const nestedInside = join(root, '.worktrees', 'a', 'b');
  git(root, 'worktree', 'add', '-q', '-b', 'ab', nestedInside);
  for (const wt of [inside, nestedInside]) {
    for (const tool_name of ['Edit', 'Write', 'MultiEdit']) {
      assert.equal(runHook({ tool_name, cwd: root, tool_input: { file_path: join(wt, 'README.md') } }), '', `${tool_name} in ${wt}`);
      assert.equal(runHook({ tool_name, cwd: root, tool_input: { file_path: join(wt, 'docs/specs/new.md') } }), '', `${tool_name} new dir in ${wt}`);
    }
    assert.equal(runHook({ tool_name: 'NotebookEdit', cwd: root, tool_input: { notebook_path: join(wt, 'nb/a.ipynb') } }), '');
    assert.equal(runHook({ tool_name: 'Edit', cwd: wt, tool_input: { file_path: 'README.md' } }), '', 'relative to a worktree cwd');
  }

  // Inside, the hook makes no further git calls: a failing check-ignore leaves no trace.
  const bin = join(root, '..', 'fake-git');
  mkdirSync(bin);
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" check-ignore "*) exit 128 ;; esac\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const PATH = `${bin}:${env.PATH}`;
  const quiet = spawnHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(inside, 'README.md') } }, { PATH });
  assert.deepEqual([quiet.stdout, quiet.stderr], ['', '']);
  const traced = spawnHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, 'README.md') } }, { PATH });
  assert.match(traced.stderr, /allowing edit, git check-ignore failed/, 'the fake git does fail check-ignore');

  // A .worktrees that is a symlink holds its worktrees at the real folder it points to.
  const { dir: dir2, root: root2 } = repo(t);
  rmSync(join(root2, '.worktrees'), { recursive: true });
  git(root2, 'worktree', 'prune');
  mkdirSync(join(dir2, 'elsewhere'));
  symlinkSync(join(dir2, 'elsewhere'), join(root2, '.worktrees'));
  git(root2, 'worktree', 'add', '-q', '-b', 'linked-folder', join(root2, '.worktrees/feat'));
  assert.equal(runHook({ tool_name: 'Edit', cwd: root2, tool_input: { file_path: join(dir2, 'elsewhere/feat/README.md') } }), '');
});

test('edit guard denies edits in a worktree outside .worktrees', (t) => {
  const { root, sibling, nested } = repo(t);
  const edit = (cwd, file_path) => runHook({ tool_name: 'Edit', cwd, tool_input: { file_path } });
  assert.equal(denialReason(edit(root, join(sibling, 'README.md'))), outsideDenyText('README.md', sibling, root));
  assert.equal(denialReason(edit(sibling, 'README.md')), outsideDenyText('README.md', sibling, root), 'relative to cwd');
  const write = runHook({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(sibling, 'docs/specs/new.md'), content: 'x' } });
  assert.equal(denialReason(write), outsideDenyText('docs/specs/new.md', sibling, root), 'new dir');
  // Claude Code's own worktree folder is outside too, even though the main checkout ignores it.
  assert.equal(denialReason(edit(root, join(nested, 'README.md'))), outsideDenyText('README.md', nested, root));
});

test('edit guard allows edits in an outside worktree when off, ignored, in CI or on git failure', (t) => {
  const { root, sibling } = repo(t);
  const input = (file_path) => ({ tool_name: 'Edit', cwd: sibling, tool_input: { file_path } });
  assert.equal(runHook(input(join(sibling, '.env'))), '', 'gitignored');
  assert.equal(runHook(input(join(sibling, 'README.md')), { CI: 'true' }), '');
  assert.equal(runHook(input(join(sibling, 'README.md')), { CLAUDE_CODE_REMOTE: 'true' }), '');
  const failed = spawnHook(input(join(sibling, 'README.md')), { PATH: '/nonexistent' });
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /^baton worktree-guard: allowing edit, git /);

  // The switch comes from the main checkout's HEAD: a branch can't turn it off for itself...
  writeFileSync(join(sibling, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: false } }));
  git(sibling, 'commit', '-qam', 'off in the branch');
  assert.notEqual(runHook(input(join(sibling, 'README.md'))), '');
  // ...and the main checkout's off holds even when the branch says on.
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: false } }));
  git(root, 'commit', '-qam', 'off');
  writeFileSync(join(sibling, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: true } }));
  git(sibling, 'commit', '-qam', 'on in the branch');
  assert.equal(runHook(input(join(sibling, 'README.md'))), '');
});

test('edit guard skips the outside check without a main checkout', (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-guard-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // A separate git dir: the common dir isn't `<checkout>/.git`.
  const proj = join(dir, 'proj');
  git(dir, 'init', '-q', '-b', 'main', '--separate-git-dir', join(dir, 'sep.git'), proj);
  mkdirSync(join(proj, '.baton'));
  writeFileSync(join(proj, '.baton/config.json'), '{}');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-qm', 'init');
  const sepWt = join(dir, 'proj-wt');
  git(proj, 'worktree', 'add', '-q', '-b', 'feat', sepWt);
  assert.equal(runHook({ tool_name: 'Edit', cwd: sepWt, tool_input: { file_path: join(sepWt, 'README.md') } }), '');
  // A bare repository has no main checkout at all.
  const bareWt = join(dir, 'bare-wt');
  git(dir, 'clone', '-q', '--bare', join(dir, 'sep.git'), join(dir, 'bare.git'));
  git(join(dir, 'bare.git'), 'worktree', 'add', '-q', '-b', 'bare-feat', bareWt);
  assert.equal(runHook({ tool_name: 'Edit', cwd: bareWt, tool_input: { file_path: join(bareWt, 'README.md') } }), '');
});

test('hook_resolves_symlinked_paths', (t) => {
  const { dir, root } = repo(t);
  const link = join(realpathSync(tmpdir()), `baton-guard-link-${process.pid}-${Date.now()}`);
  symlinkSync(dir, link);
  t.after(() => rmSync(link, { force: true }));
  const linkedRoot = join(link, 'acme');
  const edit = (file_path) => runHook({ tool_name: 'Edit', cwd: linkedRoot, tool_input: { file_path } });
  assert.equal(denialReason(edit(join(linkedRoot, 'README.md'))), denyText('README.md', root));
  assert.equal(denialReason(edit('README.md')), denyText('README.md', root), 'relative to a linked cwd');
  assert.equal(denialReason(edit(join(linkedRoot, 'docs/new.md'))), denyText('docs/new.md', root), 'new dir');
});

test('hook_does_not_run_repo_configured_fsmonitor', (t) => {
  const { dir, root } = repo(t);
  const sentinel = join(dir, 'PWNED');
  git(root, 'config', 'core.fsmonitor', `touch '${sentinel}'; false`);
  const out = runHook({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, 'new.txt'), content: 'x' } });
  assert.equal(existsSync(sentinel), false, 'core.fsmonitor ran');
  assert.equal(denialReason(out), denyText('new.txt', root));
  assert.equal(runHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, '.env') } }), '', 'ignore check still works');
  assert.equal(existsSync(sentinel), false, 'core.fsmonitor ran');
});

test('hook_denies_new_file_in_new_dir_in_main_checkout', (t) => {
  const { root, inside } = repo(t);
  const write = (file_path) => runHook({ tool_name: 'Write', cwd: root, tool_input: { file_path, content: 'x' } });
  assert.equal(denialReason(write(join(root, 'docs/specs/new.md'))), denyText('docs/specs/new.md', root));
  assert.equal(write(join(inside, 'docs/specs/new.md')), '');
});

test('hook_reads_notebook_path', (t) => {
  const { root, sibling } = repo(t);
  const nb = (path) => runHook({ tool_name: 'NotebookEdit', cwd: root, tool_input: { notebook_path: path, new_source: '' } });
  assert.equal(denialReason(nb(join(root, 'nb/a.ipynb'))), denyText('nb/a.ipynb', root));
  assert.equal(denialReason(nb(join(sibling, 'nb/a.ipynb'))), outsideDenyText('nb/a.ipynb', sibling, root));
});

test('hook_allows_ignored_git_internal_outside_and_unconfigured', (t) => {
  const { dir, root } = repo(t);
  const edit = (file_path) => runHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path } });
  assert.equal(edit(join(root, '.env')), '', 'gitignored');
  assert.equal(edit(join(root, '.git', 'config')), '', 'inside .git');
  assert.equal(edit(join(dir, 'elsewhere', 'a.txt')), '', 'outside any repo');

  const { root: bare } = repo(t, null);
  assert.equal(runHook({ tool_name: 'Edit', cwd: bare, tool_input: { file_path: join(bare, 'README.md') } }), '', 'no committed config');

  const { root: broken } = repo(t, '{not json');
  assert.equal(runHook({ tool_name: 'Edit', cwd: broken, tool_input: { file_path: join(broken, 'README.md') } }), '', 'unparseable committed config');

  const { root: wrongType } = repo(t, { hooks: { worktreeOnly: 'false' } });
  assert.equal(runHook({ tool_name: 'Edit', cwd: wrongType, tool_input: { file_path: join(wrongType, 'README.md') } }), '', 'invalid committed switch');
});

test('hook_reads_switch_from_head_not_worktree', (t) => {
  const { root } = repo(t);
  const edit = () => runHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, 'README.md') } });
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ hooks: { worktreeOnly: false } }));
  assert.notEqual(edit(), '', 'an uncommitted switch does not turn the guard off');
  git(root, 'commit', '-qam', 'off');
  assert.equal(edit(), '', 'a committed switch does');
});

test('hook_stands_down_in_ci_and_cloud', (t) => {
  const { root } = repo(t);
  const input = { tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, 'README.md') } };
  assert.equal(runHook(input, { CI: 'true' }), '');
  assert.equal(runHook(input, { CLAUDE_CODE_REMOTE: 'true' }), '');
});

test('hook_fails_open_on_bad_input', (t) => {
  const { root } = repo(t);
  assert.equal(runHook('not json'), '', 'malformed stdin');
  assert.equal(runHook(''), '', 'empty stdin');
  assert.equal(runHook({ tool_name: 'Edit', cwd: root, tool_input: {} }), '', 'missing file_path');
  assert.equal(runHook({ tool_name: 'Edit', cwd: root }), '', 'missing tool_input');
  assert.equal(runHook({ tool_name: 'Read', cwd: root, tool_input: { file_path: join(root, 'README.md') } }), '', 'ungated tool');
  // A non-string cwd makes path resolution throw inside the hook.
  const thrown = spawnHook({ tool_name: 'Edit', cwd: 42, tool_input: { file_path: 'README.md' } });
  assert.equal(thrown.stdout, '', 'thrown error');
  assert.match(thrown.stderr, /^baton worktree-guard: allowing edit, /, 'a thrown error leaves a trace');
});

test('hook_reports_git_failure_on_stderr', (t) => {
  const { root } = repo(t);
  const res = spawnHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, 'README.md') } }, { PATH: '/nonexistent' });
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /^baton worktree-guard: allowing edit, git /);
});

test('hooks_json_registers_the_guard', async () => {
  const { readFileSync } = await import('node:fs');
  const hooks = JSON.parse(readFileSync(new URL('../../hooks/hooks.json', import.meta.url), 'utf8')).hooks.PreToolUse;
  assert.deepEqual(hooks[0], {
    matcher: 'Edit|Write|MultiEdit',
    hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/fact-gate.mjs"', timeout: 5 }],
  });
  assert.deepEqual(hooks[1], {
    matcher: 'Edit|Write|MultiEdit|NotebookEdit',
    hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/worktree-guard.mjs"', timeout: 5 }],
  });
});
