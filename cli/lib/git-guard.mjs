import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './git.mjs';

/** The guard script shipped with the plugin. It is copied, never referenced: the plugin path changes with each version. */
export const TEMPLATE_PATH = fileURLToPath(new URL('../../templates/git-hooks/worktree-guard.sh', import.meta.url));
export const STUB_MARKER = '# baton:worktree-guard';
/** Runs the guard from any hook or hook manager; a no-op in clones without the script, such as CI. */
export const MANAGER_LINE = 'g="$(git rev-parse --git-common-dir)/baton/worktree-guard.sh"; [ ! -f "$g" ] || sh "$g" || exit 1';
// Hook managers whose config holds the line instead of a pre-commit file.
const MANAGER_FILES = ['lefthook.yml', '.lefthook.yml', '.pre-commit-config.yaml'];
const WIRED = 'baton/worktree-guard.sh';

const STUB = `#!/bin/sh
${STUB_MARKER}
# Written by \`baton hooks install\`. Delete this file to remove the hook.
${MANAGER_LINE}
`;

/** Where the guard lives for the repository of the checkout at `root`. */
function guardPaths(root) {
  const rev = (...args) => git(['rev-parse', '--path-format=absolute', ...args], { cwd: root }).stdout;
  const commonDir = rev('--git-common-dir');
  const hooksDir = rev('--git-path', 'hooks');
  return { commonDir, hooksDir, script: join(commonDir, 'baton', 'worktree-guard.sh'), preCommit: join(hooksDir, 'pre-commit') };
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function isInside(dir, parent) {
  const rel = relative(parent, dir);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Install the git guard for the repository of the checkout at `root`. The script is always
 * (re)written to the git common dir. A `pre-commit` stub is written only into a hooks directory
 * inside the common dir that has no pre-commit, or only ours; with a foreign hook, a hooks
 * directory elsewhere (core.hooksPath) or a hook manager's config, nothing else is touched and
 * `managerLine` is the line to add there.
 * @returns {{ script: string, stub: string | null, managerLine: string | null, reason: string | null, changed: boolean }}
 */
export function installGuard(root) {
  const { commonDir, hooksDir, script, preCommit } = guardPaths(root);
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  let changed = readIfExists(script) !== template;
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, template);

  const manager = MANAGER_FILES.find((f) => existsSync(join(root, f)));
  const existing = readIfExists(preCommit);
  let reason = null;
  if (manager) reason = `${manager} manages the hooks`;
  else if (!isInside(hooksDir, commonDir)) reason = `the hooks directory ${hooksDir} is outside the git dir (core.hooksPath)`;
  else if (existing !== null && !existing.includes(STUB_MARKER)) reason = `${preCommit} already exists and was not written by baton`;
  if (reason) return { script, stub: null, managerLine: MANAGER_LINE, reason, changed };

  changed ||= existing !== STUB;
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(preCommit, STUB);
  chmodSync(preCommit, 0o755);
  return { script, stub: preCommit, managerLine: null, reason: null, changed };
}

/**
 * `installed` when the script matches the template and a pre-commit hook or hook manager config
 * runs it, `outdated` when it runs a script that differs from the template, `missing` otherwise.
 * @returns {'installed' | 'outdated' | 'missing'}
 */
export function guardStatus(root) {
  const { script, preCommit } = guardPaths(root);
  const current = readIfExists(script);
  const wired = [preCommit, ...MANAGER_FILES.map((f) => join(root, f))].some((p) => readIfExists(p)?.includes(WIRED));
  if (current === null || !wired) return 'missing';
  return current === readFileSync(TEMPLATE_PATH, 'utf8') ? 'installed' : 'outdated';
}
