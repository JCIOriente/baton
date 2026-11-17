import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { run, BatonError, slugify } from './util.mjs';

export function git(args, opts = {}) {
  return run('git', args, opts);
}

/**
 * The main checkout's root, even when called from inside a linked worktree.
 * Config and worktree paths are always resolved against this.
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

export function worktreeBase(root, config) {
  const pattern = config.git.worktreeRoot.replace('{repo}', basename(root));
  return isAbsolute(pattern) ? pattern : resolve(root, pattern);
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
