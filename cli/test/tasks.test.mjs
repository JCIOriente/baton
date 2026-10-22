import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeClaim,
  claimComment,
  parseDependencies,
  priorityOf,
  rankClaimable,
  releaseComment,
  statusOf,
} from '../lib/tasks.mjs';
import { DEFAULT_CONFIG, validateConfig } from '../lib/config.mjs';
import { branchName, issueFromBranch, parseWorktreeList } from '../lib/git.mjs';
import { deepMerge, slugify } from '../lib/util.mjs';

const labels = DEFAULT_CONFIG.tasks.labels;
const c = (login, body) => ({ author: { login }, body });

test('parseDependencies reads Depends on / Blocked by lines, ignores other refs', () => {
  const body = 'See #99 for context.\n\nDepends on: #12, #14\n- Blocked by: #3\nother/repo#7 is unrelated';
  assert.deepEqual(parseDependencies(body), [3, 12, 14]);
  assert.deepEqual(parseDependencies('Depends on: other/repo#5'), []);
  assert.deepEqual(parseDependencies(''), []);
});

test('priorityOf parses priority labels, unprioritized sorts last', () => {
  assert.equal(priorityOf([{ name: 'priority:p1' }], 'priority:'), 1);
  assert.equal(priorityOf(['bug'], 'priority:'), 99);
});

test('statusOf prefers review > in-progress > blocked > ready', () => {
  assert.equal(statusOf({ state: 'OPEN', labels: [{ name: labels.ready }, { name: labels.inProgress }] }, labels), 'in-progress');
  assert.equal(statusOf({ state: 'CLOSED', labels: [] }, labels), 'done');
  assert.equal(statusOf({ state: 'OPEN', labels: [] }, labels), 'triage');
});

test('rankClaimable filters assigned and dependency-blocked tasks, sorts by priority then number', () => {
  const ready = [{ name: labels.ready }];
  const tasks = [
    { number: 5, body: '', labels: [...ready, { name: 'priority:p2' }], assignees: [] },
    { number: 6, body: 'Depends on: #1', labels: [...ready, { name: 'priority:p0' }], assignees: [] },
    { number: 7, body: '', labels: [...ready, { name: 'priority:p0' }], assignees: [{ login: 'x' }] },
    { number: 8, body: 'Depends on: #2', labels: [...ready, { name: 'priority:p0' }], assignees: [] },
    { number: 3, body: '', labels: [...ready, { name: 'priority:p2' }], assignees: [] },
  ];
  const open = new Set([1, 3, 5, 6, 7, 8]);
  assert.deepEqual(rankClaimable(tasks, labels, open).map((t) => t.number), [8, 3, 5]);
});

test('activeClaim: earliest claim wins', () => {
  const comments = [c('ana', claimComment('ana', 'a1')), c('bob', claimComment('bob', 'b1'))];
  assert.deepEqual(activeClaim(comments), { user: 'ana', nonce: 'a1' });
});

test('activeClaim: release clears the claim, next claim wins', () => {
  const comments = [
    c('ana', claimComment('ana', 'a1')),
    c('ana', releaseComment('ana')),
    c('bob', claimComment('bob', 'b1')),
  ];
  assert.deepEqual(activeClaim(comments), { user: 'bob', nonce: 'b1' });
});

test('activeClaim: losing claimant rollback does not clear the winner', () => {
  const comments = [
    c('ana', claimComment('ana', 'a1')),
    c('bob', claimComment('bob', 'b1')),
    c('bob', releaseComment('bob', 'lost claim race')),
  ];
  assert.deepEqual(activeClaim(comments), { user: 'ana', nonce: 'a1' });
});

test('activeClaim: a claim marker written by someone else is ignored', () => {
  assert.equal(activeClaim([c('mallory', claimComment('ana', 'x'))]), null);
});

test('branch names round-trip to issue numbers', () => {
  const cfg = DEFAULT_CONFIG;
  const b = branchName(cfg, 42, 'Validar asistencia a convenciones!');
  assert.equal(b, 'task/42-validar-asistencia-a-convenciones');
  assert.equal(issueFromBranch(cfg, b), 42);
  assert.equal(issueFromBranch(cfg, 'task/42'), 42);
  assert.equal(issueFromBranch(cfg, 'feature/42-x'), null);
  assert.equal(issueFromBranch(cfg, 'task/42abc'), null);
});

test('slugify strips accents and caps length', () => {
  assert.equal(slugify('Gestión de Organizaciones Locales'), 'gestion-de-organizaciones-locales');
  assert.ok(slugify('a'.repeat(100)).length <= 40);
});

test('parseWorktreeList reads porcelain output', () => {
  const out = 'worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /w/task-1\nHEAD def\nbranch refs/heads/task/1-x\nlocked\n';
  assert.deepEqual(parseWorktreeList(out).map((w) => [w.path, w.branch, w.locked]), [
    ['/r', 'main', false],
    ['/w/task-1', 'task/1-x', true],
  ]);
});

test('deepMerge replaces arrays and merges objects', () => {
  const merged = deepMerge(DEFAULT_CONFIG, { stacks: ['rust'], git: { baseBranch: 'develop' } });
  assert.deepEqual(merged.stacks, ['rust']);
  assert.equal(merged.git.baseBranch, 'develop');
  assert.equal(merged.git.remote, 'origin');
});

test('validateConfig flags unknown stacks and bad validate entries', () => {
  const bad = deepMerge(DEFAULT_CONFIG, { stacks: ['cobol'], validate: [{ name: 'x' }] });
  const problems = validateConfig(bad);
  assert.equal(problems.length, 2);
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
});

test('validateConfig requires instructions for custom phases', () => {
  const cfg = deepMerge(DEFAULT_CONFIG, { workflow: { phases: ['spec', 'security-audit'] } });
  assert.match(validateConfig(cfg)[0], /security-audit/);
  const ok = deepMerge(cfg, { workflow: { custom: { 'security-audit': 'docs/process/audit.md' } } });
  assert.deepEqual(validateConfig(ok), []);
});

test('activeClaim: same user racing from two sessions keeps the winner', () => {
  const comments = [
    c('ana', claimComment('ana', 'a1')),
    c('ana', claimComment('ana', 'a2')),
    c('ana', releaseComment('ana', 'lost claim race to @ana', 'a2')),
  ];
  assert.deepEqual(activeClaim(comments), { user: 'ana', nonce: 'a1' });
});

test('activeClaim: a release posted by someone else is ignored', () => {
  const comments = [c('ana', claimComment('ana', 'a1')), c('mallory', releaseComment('ana', 'forged', 'a1'))];
  assert.deepEqual(activeClaim(comments), { user: 'ana', nonce: 'a1' });
});

test('activeClaim: the claimant releases its own claim by nonce', () => {
  const comments = [c('ana', claimComment('ana', 'a1')), c('ana', releaseComment('ana', 'done', 'a1')), c('bob', claimComment('bob', 'b1'))];
  assert.deepEqual(activeClaim(comments), { user: 'bob', nonce: 'b1' });
});
