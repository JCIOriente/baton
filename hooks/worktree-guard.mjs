#!/usr/bin/env node
// PreToolUse hook: denies Edit/Write/MultiEdit/NotebookEdit of non-ignored files in a repo's
// main checkout, so every change happens in a linked worktree (spec:
// docs/specs/2026-11-06-worktree-only.md). The switch is `hooks.worktreeOnly`, read from the
// committed HEAD so an uncommitted edit can't turn it off.
//
// Standalone on purpose (no imports from cli/), like fact-gate.mjs, so a CLI change never
// breaks it. Any failure here allows the edit: this guard must never wedge a session.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

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

/**
 * Decides one edit from git's answers. Returns the deny reason, or null to allow.
 * `gitDir`/`commonDir`/`top` are null when git failed; `config` is the parsed committed
 * .baton/config.json, or null when HEAD has none or it doesn't parse.
 */
export function decide({ path, gitDir, commonDir, top, ignored, config, env }) {
  if (env.CI === 'true' || env.CLAUDE_CODE_REMOTE === 'true') return null;
  if (!gitDir || !commonDir || !top) return null;
  if (gitDir !== commonDir) return null; // a linked worktree
  if (ignored) return null;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  if (config.hooks?.worktreeOnly === false) return null;
  return denyText(relative(top, path), top);
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function git(cwd, ...args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
}

function nearestExistingDir(path) {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

function committedConfig(top) {
  const res = git(top, 'show', 'HEAD:.baton/config.json');
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
  if (rev.status !== 0) return; // not a repo, or inside .git
  const [gitDir, commonDir, top] = rev.stdout.trim().split('\n');
  if (gitDir !== commonDir) return; // a linked worktree: skip the remaining git calls

  const ignore = git(existing, 'check-ignore', '-q', path);
  if (ignore.status !== 0 && ignore.status !== 1) return; // git error
  const reason = decide({ path, gitDir, commonDir, top, ignored: ignore.status === 0, config: committedConfig(top), env: process.env });
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
  );
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  try {
    main();
  } catch {
    // Allow the edit on any internal error.
  }
}
