#!/usr/bin/env node
// PreToolUse hook: denies Edit/Write/MultiEdit/NotebookEdit of non-ignored files in a repo's
// main checkout, so every change happens in a linked worktree (spec:
// docs/specs/2026-11-06-worktree-only.md), and in a linked worktree outside
// `<main checkout>/.worktrees/` (spec: docs/specs/2026-11-17-worktrees-folder.md). The switch is
// `hooks.worktreeOnly`, read from the main checkout's committed HEAD so neither an uncommitted
// edit nor a branch can turn it off.
//
// Standalone on purpose (no imports from cli/), like fact-gate.mjs, so a CLI change never
// breaks it. Any failure here allows the edit: this guard must never wedge a session.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const GUARDED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const GIT_TIMEOUT_MS = 2000;

/** The deny reason for `relPath` (relative to the main checkout `top`). */
export function denyText(relPath, top) {
  return [
    `baton: ${relPath} is in the main checkout (${top}).`,
    'Every change happens in a linked worktree (hooks.worktreeOnly).',
    '- Task work: `baton start <n>`, then edit inside the printed path.',
    '- Anything else (spec, plan, docs, config): `baton worktree add <name>`, then edit the same',
    '  relative path under the printed path.',
    "Gitignored files are not affected. Turning this off is the user's decision",
    '("hooks": { "worktreeOnly": false } in .baton/config.json, merged to the base branch).',
  ].join('\n');
}

/** The deny reason for `path` (relative to `top`) in a linked worktree outside `<main>/.worktrees/`. */
export function outsideDenyText(path, top, main) {
  return [
    `baton: ${path} is in a worktree outside .worktrees/ (${top}).`,
    `Every worktree lives in ${main}/.worktrees/.`,
    '- Task work: `baton start <n>`, then edit inside the printed path.',
    '- Anything else: `baton worktree add <name>`, then edit there.',
  ].join('\n');
}

/**
 * Decides one edit from git's answers. Returns the deny reason, or null to allow.
 * `gitDir`/`commonDir`/`top` are null when git failed; `mainTop` is the real path of a linked
 * worktree's main checkout, or null when there is none (a bare repository or a separate git
 * dir); `config` is the parsed .baton/config.json at the main checkout's HEAD, or null when
 * HEAD has none or it doesn't parse.
 */
export function decide({ path, gitDir, commonDir, top, mainTop, ignored, config, env }) {
  if (env.CI === 'true' || env.CLAUDE_CODE_REMOTE === 'true') return null;
  if (!gitDir || !commonDir || !top) return null;
  if (ignored || !worktreeOnly(config)) return null;
  if (gitDir === commonDir) return denyText(relative(top, path), top);
  // A linked worktree: only one outside the main checkout's .worktrees/ is denied.
  if (!mainTop || isInWorktrees(top, mainTop)) return null;
  return outsideDenyText(relative(top, path), top, mainTop);
}

/** Whether the committed `config` turns the guard on. An invalid switch fails open; only a missing key or `true` means on. */
function worktreeOnly(config) {
  if (!isPlainObject(config)) return false;
  if (!('hooks' in config)) return true;
  return isPlainObject(config.hooks) && (!('worktreeOnly' in config.hooks) || config.hooks.worktreeOnly === true);
}

/** Whether the worktree folder `top` is inside `<mainTop>/.worktrees/`, comparing real paths when the folder exists. */
function isInWorktrees(top, mainTop) {
  const folder = join(mainTop, '.worktrees');
  const rel = relative(existsSync(folder) ? realpathSync(folder) : folder, top);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Leaves a trace of a fail-open on stderr (shown in debug/verbose output; never blocks). */
function allowing(cause) {
  process.stderr.write(`baton worktree-guard: allowing edit, ${cause}\n`);
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

// The target repo may be untrusted (a clone, an extracted archive), and this hook runs before
// the user approves the edit, so git must not run any command that repo's config names.
// core.fsmonitor runs on index reads (check-ignore); hooksPath is belt and braces.
const SAFE_GIT = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=/dev/null'];

function git(cwd, ...args) {
  return spawnSync('git', [...SAFE_GIT, '-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
}

/** Describes a git call that neither succeeded nor gave an expected answer. */
function gitFailure(args, res) {
  const why = res.error?.message ?? (res.signal ? `signal ${res.signal}` : `exit ${res.status}: ${res.stderr.trim().split('\n')[0]}`);
  return `git ${args} failed (${why})`;
}

function nearestExistingDir(path) {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

/** The parsed .baton/config.json at the HEAD of the main checkout, whose git dir is `commonDir`. */
function committedConfig(cwd, commonDir) {
  const res = git(cwd, '--git-dir', commonDir, 'show', 'HEAD:.baton/config.json');
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

function main() {
  const input = readStdin();
  if (!input || !GUARDED_TOOLS.has(input.tool_name)) return;
  if (process.env.CI === 'true' || process.env.CLAUDE_CODE_REMOTE === 'true') return;
  const field = input.tool_name === 'NotebookEdit' ? 'notebook_path' : 'file_path';
  const filePath = input.tool_input?.[field];
  if (typeof filePath !== 'string' || filePath === '') return;

  const abs = resolve(input.cwd ?? process.cwd(), filePath);
  const existing = nearestExistingDir(abs);
  // git answers with resolved paths (/private/tmp on macOS), so resolve ours the same way.
  const path = join(realpathSync(existing), relative(existing, abs));

  const rev = git(existing, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel');
  if (rev.error || rev.signal) return allowing(gitFailure('rev-parse', rev));
  if (rev.status !== 0) return; // not a repo, or inside .git
  const [gitDir, commonDir, top] = rev.stdout.trim().split('\n');
  let mainTop = null;
  if (gitDir !== commonDir) {
    // A linked worktree's main checkout holds the common dir as its .git; without one, nothing to check.
    if (basename(commonDir) !== '.git') return;
    mainTop = realpathSync(dirname(commonDir));
    if (isInWorktrees(top, mainTop)) return; // skip the remaining git calls
  }

  const ignore = git(existing, 'check-ignore', '-q', path);
  if (ignore.status !== 0 && ignore.status !== 1) return allowing(gitFailure('check-ignore', ignore));
  const config = committedConfig(existing, commonDir);
  const reason = decide({ path, gitDir, commonDir, top, mainTop, ignored: ignore.status === 0, config, env: process.env });
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  try {
    main();
  } catch (err) {
    // Allow the edit on any internal error, but leave a trace.
    allowing(err?.message ?? String(err));
  }
}
