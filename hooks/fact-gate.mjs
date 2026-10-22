#!/usr/bin/env node
// PreToolUse hook: the first Edit/Write of each file in a session is denied once, with
// questions the agent must answer from the codebase before retrying. Asking for facts
// (who imports this, what the data looks like) forces investigation that "are you sure?"
// never does. Idea adapted from ECC's gateguard (MIT).
//
// Opt-in per repo: .baton/config.json -> "hooks": { "factGate": true }.
// Any failure here allows the edit: this gate must never wedge a session.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';

const GATED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export function classify(relPath) {
  const p = relPath.toLowerCase().split(sep).join('/');
  const name = basename(p);
  const ext = extname(p);
  if (['claude.md', 'agents.md', 'skill.md'].includes(name) || /(^|\/)(\.claude|skills|agents|commands|hooks|reviewers|stacks)\/.*\.md$/.test(p)) {
    return 'instruction';
  }
  if (/\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)(tests?|__tests__)\//.test(p) || /_test\.(go|rs|py)$/.test(p)) return 'test';
  if (['.md', '.mdx', '.txt', '.rst'].includes(ext)) return 'prose';
  if (['.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini'].includes(ext) || /^\.env(\.|$)/.test(name)) return 'config';
  if (ext === '.sql') return 'migration';
  return 'code';
}

const SEARCH = '(search the tree; do not guess)';

export function questions(kind, isNew, relPath) {
  const q = {
    code: isNew
      ? [`Name the file(s) and line(s) that will call ${relPath}`, `Confirm no existing module already does this ${SEARCH}`]
      : [`List every file that imports or calls ${relPath} ${SEARCH}`, 'List the public functions/types this change affects and how their callers are impacted'],
    test: ['Name the behavior under test and the module/function it exercises', `Name existing tests for that module, or confirm there are none ${SEARCH}`],
    migration: ['Name the tables/columns affected and the code that reads or writes them', 'State whether the change is backward compatible with the currently deployed code, and how it rolls forward if it fails'],
    config: ['Name which process/tool reads this file and when', 'Describe the effect of the change', 'Confirm no secrets or credentials are being written in plain text'],
    prose: isNew
      ? [`Name any existing doc this duplicates or supersedes ${SEARCH}`, 'State where it will be linked from']
      : [`List docs or code that reference the section being changed ${SEARCH}`, 'State what the change corrects or adds'],
    instruction: ['Name which agent/loader reads this file and when', 'Describe what agent behavior changes as a result', `Confirm no existing instruction already covers it ${SEARCH}`],
  }[kind];
  return [...q, "Quote the user's current instruction verbatim"];
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function enabled(projectDir) {
  try {
    const cfg = JSON.parse(readFileSync(join(projectDir, '.baton', 'config.json'), 'utf8'));
    return cfg?.hooks?.factGate === true;
  } catch {
    return false;
  }
}

function statePath(sessionId) {
  const dir = join(process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'baton'), 'fact-gate');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${String(sessionId).replace(/[^\w-]/g, '_')}.json`);
}

function main() {
  const input = readStdin();
  if (!input || !GATED_TOOLS.has(input.tool_name)) return;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (!enabled(projectDir)) return;

  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string' || !input.session_id) return;
  const abs = isAbsolute(filePath) ? filePath : join(input.cwd || projectDir, filePath);

  const state = statePath(input.session_id);
  let seen = [];
  try {
    seen = JSON.parse(readFileSync(state, 'utf8'));
  } catch {
    // first gated call this session
  }
  if (seen.includes(abs)) return;
  seen.push(abs);
  writeFileSync(state, JSON.stringify(seen));

  const rel = relative(projectDir, abs) || abs;
  const isNew = !existsSync(abs);
  const asks = questions(classify(rel), isNew, rel);
  const reason = [
    `baton fact gate: before ${isNew ? 'creating' : 'editing'} ${rel}, present these facts in your reply, then retry the same edit:`,
    ...asks.map((q, i) => `${i + 1}. ${q}`),
    'This gate fires once per file per session.',
  ].join('\n');
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
