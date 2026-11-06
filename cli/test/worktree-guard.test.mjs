import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, denyText } from '../../hooks/worktree-guard.mjs';

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
 * as is), with a gitignored `.env`, a sibling linked worktree and one nested at
 * `.claude/worktrees/x` (gitignored unless `ignoreNested` is false).
 */
function repo(t, config = {}, { ignoreNested = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-guard-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'acme');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'README.md'), 'acme\n');
  writeFileSync(join(root, '.gitignore'), ignoreNested ? '.env\n.claude/worktrees/\n' : '.env\n');
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
  return { dir, root, sibling, nested };
}

const on = { hooks: { worktreeOnly: true } };
const main = { gitDir: '/r/acme/.git', commonDir: '/r/acme/.git', top: '/r/acme', path: '/r/acme/docs/a.md', ignored: false, config: on, env: {} };

// --- decide (pure) ---

test('decide_allows_linked_worktree', () => {
  assert.equal(decide({ ...main, gitDir: '/r/acme/.git/worktrees/docs', top: '/r/acme-worktrees/docs', path: '/r/acme-worktrees/docs/docs/a.md' }), null);
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

test('hook_denies_main_checkout_edit_and_allows_worktrees', (t) => {
  const { root, sibling, nested } = repo(t);
  const edit = (cwd, file_path) => runHook({ tool_name: 'Edit', cwd, tool_input: { file_path } });
  assert.equal(denialReason(edit(root, join(root, 'README.md'))), denyText('README.md', root));
  assert.equal(denialReason(edit(root, 'README.md')), denyText('README.md', root), 'relative to cwd');
  assert.equal(edit(root, join(sibling, 'README.md')), '');
  assert.equal(edit(sibling, 'README.md'), '');
  assert.equal(edit(root, join(nested, 'README.md')), '');
  // The edited file's directory picks the checkout, not the session cwd.
  assert.equal(denialReason(edit(sibling, join(root, 'README.md'))), denyText('README.md', root));
  assert.equal(denialReason(edit(nested, join(root, 'README.md'))), denyText('README.md', root));
});

test('hook_allows_nested_worktree_not_gitignored', (t) => {
  const { root, nested } = repo(t, {}, { ignoreNested: false });
  const edit = (file_path) => runHook({ tool_name: 'Edit', cwd: root, tool_input: { file_path } });
  assert.equal(edit(join(nested, 'README.md')), '');
  assert.equal(edit(join(nested, 'docs/specs/new.md')), '');
  assert.equal(denialReason(edit(join(root, 'README.md'))), denyText('README.md', root));
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
  const { root, sibling } = repo(t);
  const write = (file_path) => runHook({ tool_name: 'Write', cwd: root, tool_input: { file_path, content: 'x' } });
  assert.equal(denialReason(write(join(root, 'docs/specs/new.md'))), denyText('docs/specs/new.md', root));
  assert.equal(write(join(sibling, 'docs/specs/new.md')), '');
});

test('hook_allows_nested_worktree', (t) => {
  const { root, nested } = repo(t);
  for (const tool_name of ['Edit', 'Write', 'MultiEdit']) {
    assert.equal(runHook({ tool_name, cwd: root, tool_input: { file_path: join(nested, 'README.md') } }), '');
    assert.equal(runHook({ tool_name, cwd: root, tool_input: { file_path: join(nested, 'docs/specs/new.md') } }), '');
  }
});

test('hook_reads_notebook_path', (t) => {
  const { root, sibling } = repo(t);
  const nb = (path) => runHook({ tool_name: 'NotebookEdit', cwd: root, tool_input: { notebook_path: path, new_source: '' } });
  assert.equal(denialReason(nb(join(root, 'nb/a.ipynb'))), denyText('nb/a.ipynb', root));
  assert.equal(nb(join(sibling, 'nb/a.ipynb')), '');
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
