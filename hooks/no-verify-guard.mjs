#!/usr/bin/env node
// PreToolUse hook: denies Bash commands that skip git's hooks (`git commit --no-verify`, `-n`,
// `git push --no-verify`), since that also skips the repo's commit gates and worktree guard.
// Active only in projects with .baton/config.json. Standalone (no imports from cli/), and any
// failure allows the call: this guard must never wedge a session.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MESSAGE =
  "baton: --no-verify skips the repo's commit gates and worktree guard. Never use `git commit --no-verify`; fix the failing gate instead.";

/** Replaces quoted strings with a placeholder token, so their text never counts. */
function stripQuotes(command) {
  return command.replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, 'Q');
}

/** The refusal message for `command`, or null when it is allowed. */
export function refusal(command) {
  const segments = stripQuotes(command).split(/;|&&|\|\||\||\n/);
  for (const segment of segments) {
    const words = segment.trim().split(/\s+/);
    const at = words.indexOf('git');
    if (at === -1) continue;
    let i = at + 1;
    while (i < words.length && words[i].startsWith('-')) {
      i += words[i] === '-C' || words[i] === '-c' ? 2 : 1;
    }
    const sub = words[i];
    const args = words.slice(i + 1);
    if (sub === 'commit' && args.some((a) => a === '--no-verify' || /^-[^-]*n/.test(a))) return MESSAGE;
    if (sub === 'push' && args.includes('--no-verify')) return MESSAGE;
  }
  return null;
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const input = readStdin();
  if (!input || input.tool_name !== 'Bash') return;
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return;
  const dir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  if (!existsSync(join(dir, '.baton', 'config.json'))) return;
  const reason = refusal(command);
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
  );
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`baton no-verify-guard: allowing, ${err?.message ?? String(err)}\n`);
  }
}
