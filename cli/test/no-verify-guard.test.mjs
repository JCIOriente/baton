import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refusal } from '../../hooks/no-verify-guard.mjs';

const hook = new URL('../../hooks/no-verify-guard.mjs', import.meta.url).pathname;

function run(input, projectDir) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir };
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  return spawnSync('node', [hook], { input: stdin, env, encoding: 'utf8' });
}

function project(withConfig) {
  const dir = mkdtempSync(join(tmpdir(), 'nv-'));
  if (withConfig) {
    mkdirSync(join(dir, '.baton'));
    writeFileSync(join(dir, '.baton', 'config.json'), '{}');
  }
  return dir;
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('refuses git commit -n', () => {
  for (const cmd of ['git commit --no-verify -m x', 'git commit -n -m x', 'git commit -anm x', 'git -C x commit -n']) {
    assert.match(refusal(cmd), /fix the failing gate/, cmd);
  }
});

test('refuses git push --no-verify', () => {
  assert.match(refusal('git push --no-verify'), /fix the failing gate/);
});

test('allows git push -n', () => {
  for (const cmd of ['git push -n', 'git log -n 5', 'echo --no-verify']) assert.equal(refusal(cmd), null, cmd);
});

test('allows -n inside a quoted message', () => {
  for (const cmd of ['git commit -m "-n"', "git commit -m 'skip --no-verify'"]) assert.equal(refusal(cmd), null, cmd);
});

test('refuses git commit -n after a semicolon', () => {
  for (const cmd of ['cd x && git commit -n', 'true; git commit -n', 'a || git commit -n', 'a | git commit -n', 'a\ngit commit -n']) {
    assert.match(refusal(cmd), /fix the failing gate/, cmd);
  }
});

test('allows when the project has no baton config', () => {
  const dir = project(false);
  try {
    const res = run(bash('git commit -n'), dir);
    assert.equal(res.stdout, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('denies through the hook when the project has a baton config', () => {
  const dir = project(true);
  try {
    const out = JSON.parse(run(bash('git commit -n'), dir).stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('malformed input passes through', () => {
  const dir = project(true);
  try {
    for (const input of ['not json', {}, { tool_name: 'Bash' }, { tool_name: 'Bash', tool_input: { command: 5 } }]) {
      const res = run(input, dir);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, '');
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});
