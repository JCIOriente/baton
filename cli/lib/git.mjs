import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { BatonError, run, slugify } from './util.mjs';

export function git(args, opts = {}) {
  return run('git', args, opts);
}

/**
 * The main checkout's root, even when called from inside a linked worktree.
 * Worktree paths are always resolved against this; config is read from `currentTop`.
 */
export function repoRoot(cwd = process.cwd()) {
  const res = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, allowFail: true });
  if (res.code !== 0) throw new BatonError('Not inside a git repository', { hint: 'Run `git init` first.' });
  const common = res.stdout;
  // For a normal repo the common dir is <root>/.git
  return basename(common) === '.git' ? dirname(common) : git(['rev-parse', '--show-toplevel'], { cwd }).stdout;
}

/** Root of the checkout the caller is currently in (may be a worktree). */
export function currentTop(cwd = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).stdout;
}

export function currentBranch(cwd = process.cwd()) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout;
}

/** Parse `git worktree list --porcelain`. */
export function parseWorktreeList(porcelain) {
  const out = [];
  let cur = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9), branch: null, head: null, locked: false, prunable: false };
    } else if (!cur) continue;
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line.startsWith('locked')) cur.locked = true;
    else if (line.startsWith('prunable')) cur.prunable = true;
  }
  if (cur) out.push(cur);
  return out;
}

export function listWorktrees(root) {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain'], { cwd: root }).stdout);
}

/** The folder every linked worktree lives in: `.worktrees/` at the main checkout's root. */
export function worktreeBase(root) {
  return join(root, '.worktrees');
}

/** The ignore lines that count as ignoring the worktrees folder, in `.gitignore` or `info/exclude`. */
export const GITIGNORE_FORMS = Object.freeze(['/.worktrees/', '.worktrees/', '/.worktrees', '.worktrees']);

/** Whether `path` is inside `worktreeBase(root)`, comparing real paths (macOS `/tmp` is `/private/tmp`). */
export function isInWorktrees(root, path) {
  return realPath(path).startsWith(`${realPath(worktreeBase(root))}${sep}`);
}

/** The real path of `p`; for a path that doesn't exist yet, its nearest existing parent's, with the rest appended. */
function realPath(p) {
  try {
    return realpathSync(p);
  } catch (err) {
    if (err.code !== 'ENOENT' || dirname(p) === p) throw err;
    return join(realPath(dirname(p)), basename(p));
  }
}

/**
 * Appends `/.worktrees/` to the ignore file `file` unless it already holds an accepted form,
 * comparing lines with trailing whitespace dropped (git keeps a leading space in the pattern).
 * Adds a newline first when the file doesn't end with one. Returns whether it wrote the line.
 */
export function addWorktreesLine(file) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (text.split('\n').some((line) => GITIGNORE_FORMS.includes(line.trimEnd()))) return false;
  appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}/.worktrees/\n`);
  return true;
}

/**
 * Makes `<common dir>/info/exclude` ignore the worktrees folder, creating `info/` if needed. A
 * failed write is returned as a warning: an unignored folder must not block work.
 */
export function ensureExcluded(root) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root }).stdout;
  const file = join(common, 'info', 'exclude');
  try {
    mkdirSync(dirname(file), { recursive: true });
    return { added: addWorktreesLine(file) };
  } catch (err) {
    return { added: false, warning: `could not write ${file} (${err.code ?? err.message}); add the line /.worktrees/ to it by hand.` };
  }
}

export function branchName(config, issueNumber, title) {
  const slug = slugify(title);
  return slug ? `${config.git.branchPrefix}/${issueNumber}-${slug}` : `${config.git.branchPrefix}/${issueNumber}`;
}

/** Extract the issue number from a branch produced by `branchName`. */
export function issueFromBranch(config, branch) {
  if (!branch) return null;
  const m = branch.match(new RegExp(`^${escapeRe(config.git.branchPrefix)}/(\\d+)(?:-|$)`));
  return m ? Number(m[1]) : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasUncommittedChanges(cwd) {
  return git(['status', '--porcelain'], { cwd }).stdout.length > 0;
}

/**
 * Commits on the checked-out branch that its upstream lacks; null with no upstream (or a detached
 * HEAD). When the upstream branch is gone from the remote, the commits no ref of that remote has.
 */
export function unpushedCount(cwd) {
  const head = git(['symbolic-ref', '-q', 'HEAD'], { cwd, allowFail: true });
  if (head.code !== 0) return null;
  const [upstream, track, remote] = git(['for-each-ref', '--format=%(upstream)%00%(upstream:track)%00%(upstream:remotename)', head.stdout], {
    cwd,
  }).stdout.split('\0');
  if (!upstream) return null;
  const range = track === '[gone]' ? ['HEAD', '--not', `--remotes=${remote}`] : [`${upstream}..HEAD`];
  return Number(git(['rev-list', '--count', ...range], { cwd }).stdout);
}

/** How far local `branch` is ahead of and behind `remote`'s copy, as of the last fetch; null without that ref. */
export function aheadBehind(cwd, remote, branch) {
  const tracking = `refs/remotes/${remote}/${branch}`;
  if (git(['rev-parse', '--verify', '--quiet', tracking], { cwd, allowFail: true }).code !== 0) return null;
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd, allowFail: true }).code !== 0) {
    throw new BatonError(`No local base branch ${branch}`, { hint: `Create it with \`git branch ${branch} ${remote}/${branch}\`, then retry.` });
  }
  const [ahead, behind] = git(['rev-list', '--left-right', '--count', `refs/heads/${branch}...${tracking}`], { cwd })
    .stdout.split(/\s+/)
    .map(Number);
  return { ahead, behind };
}

/** The text of file `path` at `ref`, or null when the ref or the file is not there (or is a directory). */
export function showFile(cwd, ref, path) {
  if (git(['cat-file', '-t', `${ref}:${path}`], { cwd, allowFail: true }).stdout !== 'blob') return null;
  return git(['show', `${ref}:${path}`], { cwd }).stdout;
}

export function remoteBranchExists(root, remote, branch) {
  return git(['ls-remote', '--exit-code', '--heads', remote, branch], { cwd: root, allowFail: true }).code === 0;
}

export function pathExists(p) {
  return existsSync(p);
}

export { join };
