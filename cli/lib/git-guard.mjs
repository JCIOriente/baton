import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './git.mjs';

/** The guard script shipped with the plugin. It is copied, never referenced: the plugin path changes with each version. */
export const TEMPLATE_PATH = fileURLToPath(new URL('../../templates/git-hooks/worktree-guard.sh', import.meta.url));
const COMMIT_GATES_TEMPLATE_PATH = fileURLToPath(new URL('../../templates/git-hooks/commit-gates.sh', import.meta.url));
/** Where the commit-gates script lives, relative to the git common dir. */
export const COMMIT_GATES_PATH = 'baton/commit-gates.sh';
export const STUB_MARKER = '# baton:worktree-guard';
/** Runs the guard from any hook or hook manager; a no-op in clones without the script, such as CI. */
export const MANAGER_LINE = 'g="$(git rev-parse --git-common-dir)/baton/worktree-guard.sh"; [ ! -f "$g" ] || sh "$g" || exit 1';
/** Runs the commit gates after the guard, the same way. */
export const COMMIT_GATES_LINE = `c="$(git rev-parse --git-common-dir)/${COMMIT_GATES_PATH}"; [ ! -f "$c" ] || sh "$c" || exit 1`;
// Hook managers whose config holds the line instead of a pre-commit file: the command that
// installs the manager's git hook, and what that installed hook contains.
const MANAGERS = {
  'lefthook.yml': { install: 'lefthook install', hook: /lefthook/ },
  '.lefthook.yml': { install: 'lefthook install', hook: /lefthook/ },
  '.pre-commit-config.yaml': { install: 'pre-commit install', hook: /pre-commit\.com|pre_commit/ },
};
const WIRED = 'baton/worktree-guard.sh';

/** CI and cloud sessions are single-use clones, where the guard stands down. */
export function isDisposableClone(env = process.env) {
  return env.CI === 'true' || env.CLAUDE_CODE_REMOTE === 'true';
}

/**
 * Whether the checkout at `root` is a main checkout, the one the guard protects. In a bare
 * repository every working tree is linked, so there is none.
 */
export function isMainCheckout(root) {
  const rev = (...args) => git(['rev-parse', '--path-format=absolute', ...args], { cwd: root }).stdout;
  return rev('--git-dir') === rev('--git-common-dir');
}

const STUB = `#!/bin/sh
${STUB_MARKER}
# Written by \`baton hooks install\`. Delete this file to remove the hook.
${MANAGER_LINE}
${COMMIT_GATES_LINE}
`;

/** Where the guard lives for the repository of the checkout at `root`. */
function guardPaths(root) {
  const rev = (...args) => git(['rev-parse', '--path-format=absolute', ...args], { cwd: root }).stdout;
  const commonDir = rev('--git-common-dir');
  const hooksDir = rev('--git-path', 'hooks');
  const preCommit = join(hooksDir, 'pre-commit');
  // husky v9 points core.hooksPath at a generated `.husky/_`; the user's hook is `.husky/pre-commit`.
  const userHook = !isInside(hooksDir, commonDir) && basename(hooksDir) === '_' ? join(dirname(hooksDir), 'pre-commit') : preCommit;
  const gates = join(commonDir, COMMIT_GATES_PATH);
  return { commonDir, hooksDir, script: join(commonDir, 'baton', 'worktree-guard.sh'), gates, preCommit, userHook };
}

// A stub carries only the marker, comments, guard and commit-gates lines; anything else was added
// by hand. The 0.7.0 stub, with the guard line alone, is ours too, so install upgrades it.
function isOurStub(text) {
  if (!text.includes(STUB_MARKER)) return false;
  return text.split('\n').every((l) => !l.trim() || l.startsWith('#') || l.includes(WIRED) || l.includes(COMMIT_GATES_PATH));
}

/** Whether a pre-commit hook, or an installed hook manager's config, mentions `marker`. */
function isWired({ preCommit, userHook }, root, marker) {
  const hook = readIfExists(preCommit);
  // A manager's config only runs the line once the manager's own hook is installed in this clone.
  const managed = Object.entries(MANAGERS).some(([f, m]) => readIfExists(join(root, f))?.includes(marker) && m.hook.test(hook ?? ''));
  return managed || [preCommit, userHook].some((p) => readIfExists(p)?.includes(marker));
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function isInside(dir, parent) {
  const rel = relative(parent, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Install the git guard and the commit-gates script for the repository of the checkout at
 * `root`. Both scripts are always (re)written to the git common dir. A `pre-commit` stub is
 * written only into a hooks directory inside the common dir that has no pre-commit, or only
 * ours (including the 0.7.0 stub, which it upgrades); with a foreign hook, a hooks
 * directory elsewhere (core.hooksPath) or a hook manager's config, nothing else is touched and
 * `managerLine` holds the lines to add there, one per script.
 * @returns {{ script: string, gates: string, stub: string | null, managerLine: string | null, reason: string | null, changed: boolean }}
 */
export function installGuard(root) {
  const { commonDir, hooksDir, script, gates, preCommit, userHook } = guardPaths(root);
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const gatesTemplate = readFileSync(COMMIT_GATES_TEMPLATE_PATH, 'utf8');
  let changed = readIfExists(script) !== template || readIfExists(gates) !== gatesTemplate;
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, template);
  writeFileSync(gates, gatesTemplate);

  const manager = Object.keys(MANAGERS).find((f) => existsSync(join(root, f)));
  const existing = readIfExists(preCommit);
  let reason = null;
  if (manager) reason = `${manager} manages the hooks (\`${MANAGERS[manager].install}\` installs its git hook)`;
  else if (!isInside(hooksDir, commonDir)) {
    reason = userHook === preCommit
      ? `the hooks directory ${hooksDir} is outside the git dir (core.hooksPath); the hook to edit is ${preCommit}`
      : `the hooks directory ${hooksDir} is generated by husky; the hook to edit is ${userHook}`;
  } else if (existing !== null && !existing.includes(STUB_MARKER)) reason = `${preCommit} already exists and was not written by baton`;
  else if (existing !== null && !isOurStub(existing)) reason = `${preCommit} has other lines besides baton's, so it was not rewritten`;
  if (reason) return { script, gates, stub: null, managerLine: `${MANAGER_LINE}\n${COMMIT_GATES_LINE}`, reason, changed };

  changed ||= existing !== STUB;
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(preCommit, STUB);
  chmodSync(preCommit, 0o755);
  return { script, gates, stub: preCommit, managerLine: null, reason: null, changed };
}

/**
 * `installed` when the script matches the template and a pre-commit hook (husky's `.husky/pre-commit`
 * for a husky v9 `.husky/_`) or an installed hook manager's config runs it, `outdated` when it runs a script that differs from the template, `missing` otherwise.
 * @returns {'installed' | 'outdated' | 'missing'}
 */
export function guardStatus(root) {
  const paths = guardPaths(root);
  const current = readIfExists(paths.script);
  if (current === null || !isWired(paths, root, WIRED)) return 'missing';
  return current === readFileSync(TEMPLATE_PATH, 'utf8') ? 'installed' : 'outdated';
}

/**
 * `not-needed` when no `validate` step of `config` lists `commit` in `stages`; otherwise
 * `installed` when the commit-gates script exists and a pre-commit hook or an installed hook
 * manager's config runs it, `missing` when not.
 * @param {string} root
 * @param {{ validate?: { stages?: string[] }[] }} config
 * @returns {'installed' | 'missing' | 'not-needed'}
 */
export function commitGatesStatus(root, config) {
  // The config may not be validated yet: only an array of stages can name the commit stage.
  const hasCommitStep = (config.validate ?? []).some((step) => Array.isArray(step.stages) && step.stages.includes('commit'));
  if (!hasCommitStep) return 'not-needed';
  const paths = guardPaths(root);
  return existsSync(paths.gates) && isWired(paths, root, COMMIT_GATES_PATH) ? 'installed' : 'missing';
}
