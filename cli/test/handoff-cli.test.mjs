import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../baton.mjs', import.meta.url).pathname;
// Isolated from the user's git config (signing, hooks), with a fixed identity.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GH_TOKEN: '',
};

const SPEC_A = 'docs/specs/a.md';
const SPEC_B = 'docs/specs/b.md';
const SPEC_TEXT = '# A\n\n## Implementation status\n- [x] Plan\n- [ ] Plan and issues\n';

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

/** An open issue as `gh issue list --json` returns it. */
function issue(number, { labels = [], spec, assignees = [] } = {}) {
  const body = spec ? `Spec: ${spec} · Plan: docs/plans/x.md#t1\r\n\r\n## Scope\r\n` : 'No spec line here.';
  return { number, title: `Task ${number}`, body, state: 'OPEN', assignees: assignees.map((login) => ({ login })), labels: labels.map((name) => ({ name })), url: '' };
}

/** An open PR as `gh pr list --json` returns it. */
function pr(number, headRefName, { title = `PR ${number}`, labels = [], checks = [] } = {}) {
  return { number, title, headRefName, isDraft: false, reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: checks, labels: labels.map((name) => ({ name })) };
}

/** Two specs, a No-spec task, a triage issue, a task PR and a release PR. */
const BACKLOG = {
  issues: [
    issue(160, { labels: ['status:in-progress'], spec: SPEC_A, assignees: ['arnold'] }),
    issue(161, { labels: ['status:review'], spec: `./${SPEC_A}` }),
    issue(170, { labels: ['status:ready'], spec: `[b](${SPEC_B})` }),
    issue(171, { labels: ['status:blocked'], spec: SPEC_B }),
    issue(180, { labels: ['status:ready'] }),
    issue(190),
  ],
  prs: [
    pr(165, 'task/161-handoff', { checks: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    pr(145, 'release-please--branches--main', { title: 'chore(main): release 0.7.0', labels: ['autorelease: pending'] }),
  ],
};

/**
 * A fake `gh` first on PATH: it logs each call to <dir>/gh.log, answers `issue list` with `issues`
 * and `pr list` with `prs`, and fails anything else. With `loggedOut`, every call fails the way gh
 * does without a login.
 */
function withFakeGh(dir, { issues = [], prs = [], loggedOut = false } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'gh.log');
  const data = join(dir, 'gh-data.json');
  writeFileSync(data, JSON.stringify({ issues, prs }));
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
if (${loggedOut}) { console.error('To get started with GitHub CLI, please run:  gh auth login'); process.exit(4); }
const data = JSON.parse(fs.readFileSync(${JSON.stringify(data)}, 'utf8'));
if (a[0] === 'issue' && a[1] === 'list') console.log(JSON.stringify(data.issues));
else if (a[0] === 'pr' && a[1] === 'list') console.log(JSON.stringify(data.prs));
else { console.error('unexpected call'); process.exit(1); }
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return {
    log: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    run: (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, PATH: `${bin}:${env.PATH}` }, encoding: 'utf8' }),
  };
}

/** A clone of a bare "origin" whose main holds a baton config and `files` ({ path: text }). */
function repo(t, files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-handoff-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, 'origin.git');
  const root = join(dir, 'acme');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, root);
  git(root, 'checkout', '-qb', 'main');
  writeFileSync(join(root, 'README.md'), 'acme\n');
  mkdirSync(join(root, '.baton'));
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ project: 'acme' }));
  for (const [path, text] of Object.entries(files)) writeAt(root, path, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  git(root, 'push', '-q', '-u', 'origin', 'main');
  return { dir, root, base: join(dir, 'acme-worktrees') };
}

function writeAt(root, path, text) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** The "Where things stand" section of a rendered prompt. */
function standing(prompt) {
  return prompt.split('## Where things stand\n')[1].split('\n\n## Stop at')[0];
}

test('handoff_groups_by_spec', (t) => {
  const { dir, root } = repo(t, { [SPEC_A]: SPEC_TEXT, [SPEC_B]: SPEC_TEXT });
  const res = withFakeGh(dir, BACKLOG).run(root, 'handoff');
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.startsWith('Continue acme (this repo). Load baton:workflow.\n'), res.stdout);
  assert.equal(
    standing(res.stdout),
    [
      'Other open work:',
      `- ${SPEC_A}: in-progress #160 (arnold) · review #161 (PR #165, ci passing, review required)`,
      `- ${SPEC_B}: ready: #170 · blocked: #171`,
      '- No spec: ready: #180',
      '- Open PRs without a task: #145 chore(main): release 0.7.0 [release PR]',
      'Not listed: 1 triage issues',
      'Worktrees: none',
      'Base branch main: up to date with origin/main (as of last fetch)',
    ].join('\n'),
  );
  assert.match(res.stdout, /^## Leave alone\n<FILL: other sessions' work; candidates: none \(no --spec\)>$/m);
});

test('handoff_spec_from_base_branch', (t) => {
  const { dir, root } = repo(t);
  // The spec reaches origin/main from another clone; the main checkout only fetches it.
  const other = join(dir, 'other');
  git(dir, 'clone', '-q', join(dir, 'origin.git'), other);
  writeAt(other, 'docs/specs/next.md', SPEC_TEXT);
  git(other, 'add', '-A');
  git(other, 'commit', '-qm', 'spec');
  git(other, 'push', '-q', 'origin', 'main');
  git(root, 'fetch', '-q', 'origin');
  assert.ok(!existsSync(join(root, 'docs/specs/next.md')));
  const res = withFakeGh(dir).run(root, 'handoff', '--spec', './docs/specs/next.md');
  assert.equal(res.status, 0, res.stderr);
  assert.match(standing(res.stdout), /^Next session's unit: docs\/specs\/next\.md\n- no open tasks\n- Implementation status still open: "Plan and issues"$/m);
  const json = JSON.parse(withFakeGh(dir).run(root, 'handoff', '--spec', 'docs/specs/next.md', '--json').stdout);
  assert.deepEqual(json.unit, { spec: 'docs/specs/next.md', found: true });
  assert.deepEqual(json.groups[0].openStatusItems, ['Plan and issues']);
});

test('handoff_spec_from_working_tree', (t) => {
  const { dir, root } = repo(t);
  writeAt(root, 'docs/specs/draft.md', SPEC_TEXT.replace('Plan and issues', 'Draft item'));
  const res = withFakeGh(dir).run(root, 'handoff', '--spec', 'docs/specs/draft.md');
  assert.equal(res.status, 0, res.stderr);
  assert.match(standing(res.stdout), /^- Implementation status still open: "Draft item"$/m);
});

test('handoff_unknown_spec_fails', (t) => {
  const { dir, root } = repo(t);
  const res = withFakeGh(dir, BACKLOG).run(root, 'handoff', '--spec', 'docs/specs/nope.md');
  assert.equal(res.status, 1);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /docs\/specs\/nope\.md/);
});

test('handoff_json_shape', (t) => {
  const { dir, root } = repo(t, { [SPEC_A]: SPEC_TEXT });
  const gh = withFakeGh(dir, BACKLOG);
  const res = gh.run(root, 'handoff', '--json');
  assert.equal(res.status, 0, res.stderr);
  const json = JSON.parse(res.stdout);
  assert.deepEqual(Object.keys(json), ['schemaVersion', 'unit', 'groups', 'prsWithoutTask', 'worktrees', 'base', 'leaveAloneCandidates', 'triageCount', 'truncated']);
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.unit, null);
  assert.deepEqual(
    json.groups.map((g) => g.spec),
    [SPEC_A, SPEC_B, null],
  );
  assert.deepEqual(json.groups[0], {
    spec: SPEC_A,
    tasks: [
      { number: 160, title: 'Task 160', status: 'in-progress', assignees: ['arnold'], pr: null },
      { number: 161, title: 'Task 161', status: 'review', assignees: [], pr: { number: 165, draft: false, reviewDecision: 'REVIEW_REQUIRED', checks: 'passing' } },
    ],
    openStatusItems: ['Plan and issues'],
  });
  assert.deepEqual(json.prsWithoutTask, [{ number: 145, title: 'chore(main): release 0.7.0', branch: 'release-please--branches--main', release: true }]);
  assert.deepEqual(json.worktrees, []);
  assert.deepEqual(json.base, { branch: 'main', remote: 'origin', ahead: 0, behind: 0, tracking: true });
  assert.deepEqual(json.leaveAloneCandidates, { tasks: [], prs: [], worktrees: [] });
  assert.equal(json.triageCount, 1);
  assert.equal(json.truncated, false);

  // With --spec, the candidates are filled in and the unit leads the groups.
  const unit = JSON.parse(gh.run(root, 'handoff', '--spec', SPEC_B, '--json').stdout);
  assert.deepEqual(unit.unit, { spec: SPEC_B, found: false });
  assert.equal(unit.groups[0].spec, SPEC_B);
  assert.deepEqual(unit.leaveAloneCandidates, { tasks: [160, 161], prs: [165, 145], worktrees: [] });
});

test('handoff_logged_out_fails_cleanly', (t) => {
  const { dir, root } = repo(t);
  const res = withFakeGh(dir, { loggedOut: true }).run(root, 'handoff');
  assert.equal(res.status, 1);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /^baton: Could not read tasks and PRs from GitHub/);
  assert.match(res.stderr, /^hint: .*gh auth login/m);
  assert.doesNotMatch(res.stderr, /Nothing was changed/);
});

test('handoff_no_open_work', (t) => {
  const { dir, root } = repo(t);
  const res = withFakeGh(dir).run(root, 'handoff');
  assert.equal(res.status, 0, res.stderr);
  for (const slot of ['Goal', 'Stop at', 'Next steps', 'Leave alone']) assert.match(res.stdout, new RegExp(`^## ${slot}\\n<FILL: `, 'm'), slot);
  assert.match(standing(res.stdout), /^No open tasks\.$/m);
});

test('handoff_two_gh_calls', (t) => {
  const { dir, root } = repo(t);
  const gh = withFakeGh(dir, BACKLOG);
  assert.equal(gh.run(root, 'handoff', '--spec', SPEC_A).status, 0);
  const calls = gh.log();
  assert.equal(calls.length, 2, calls.join('\n'));
  assert.match(calls[0], /^issue list .*--limit 1000\b/);
  assert.match(calls[1], /^pr list .*--limit 1000\b/);
  assert.match(calls[1], /--json number,title,headRefName,isDraft,reviewDecision,statusCheckRollup,labels\b/);
});

test('handoff_truncation_warns', (t) => {
  const { dir, root } = repo(t);
  const issues = Array.from({ length: 1000 }, (_, i) => issue(i + 1));
  const gh = withFakeGh(dir, { issues });
  const res = gh.run(root, 'handoff', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).truncated, true);
  assert.match(res.stderr, /^warning: .*1000/m);
  const text = gh.run(root, 'handoff');
  assert.match(standing(text.stdout), /^Lists cut at 1000; more exist\.$/m);

  const prs = Array.from({ length: 1000 }, (_, i) => pr(i + 1, `b${i}`));
  assert.equal(JSON.parse(withFakeGh(dir, { prs }).run(root, 'handoff', '--json').stdout).truncated, true);
});

test('handoff_worktree_flags', (t) => {
  const { dir, root, base } = repo(t, { [SPEC_B]: SPEC_TEXT });
  const pushed = join(base, '160');
  git(root, 'worktree', 'add', '-q', '-b', 'task/160-pushed', pushed, 'main');
  git(pushed, 'push', '-q', '-u', 'origin', 'task/160-pushed');
  git(pushed, 'commit', '-q', '--allow-empty', '-m', 'one');
  git(pushed, 'commit', '-q', '--allow-empty', '-m', 'two');
  writeFileSync(join(pushed, 'wip.txt'), 'wip\n');
  const local = join(base, 'notes');
  git(root, 'worktree', 'add', '-q', '-b', 'notes', local, 'main');
  const stale = join(base, '170');
  git(root, 'worktree', 'add', '-q', '-b', 'task/170-gone', stale, 'main');
  rmSync(stale, { recursive: true, force: true });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'local only');

  const gh = withFakeGh(dir, { issues: [issue(160, { labels: ['status:in-progress'], spec: SPEC_A })] });
  const res = gh.run(root, 'handoff', '--spec', SPEC_B);
  assert.equal(res.status, 0, res.stderr);
  const lines = standing(res.stdout).split('\n');
  assert.ok(
    lines.includes(`Worktrees: #160 task/160-pushed (uncommitted, 2 unpushed) ${pushed} · #170 task/170-gone (missing; baton worktree prune) ${stale} · notes (not pushed) ${local}`),
    lines.join('\n'),
  );
  assert.ok(lines.includes('Base branch main: 1 ahead, 0 behind origin/main (as of last fetch)'), lines.join('\n'));
  assert.match(res.stdout, /candidates: #160, worktree 160, worktree notes>/);

  const json = JSON.parse(gh.run(root, 'handoff', '--json').stdout);
  assert.deepEqual(
    json.worktrees.map(({ task, branch, dirty, stale: isStale, unpushed, current }) => ({ task, branch, dirty, stale: isStale, unpushed, current })),
    [
      { task: 160, branch: 'task/160-pushed', dirty: true, stale: false, unpushed: 2, current: false },
      { task: 170, branch: 'task/170-gone', dirty: false, stale: true, unpushed: null, current: false },
      { task: null, branch: 'notes', dirty: false, stale: false, unpushed: null, current: false },
    ],
  );

  git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
  const untracked = gh.run(root, 'handoff');
  assert.equal(untracked.status, 0, untracked.stderr);
  assert.match(standing(untracked.stdout), /^Base branch main: no remote-tracking ref$/m);
  assert.deepEqual(JSON.parse(gh.run(root, 'handoff', '--json').stdout).base, { branch: 'main', remote: 'origin', ahead: null, behind: null, tracking: false });
});

test('handoff_is_read_only', (t) => {
  const { dir, root, base } = repo(t, { [SPEC_A]: SPEC_TEXT });
  const wt = join(base, '160');
  git(root, 'worktree', 'add', '-q', '-b', 'task/160-x', wt, 'main');
  // Same content, another mtime: a plain `git status` would refresh the index to record it.
  const past = new Date('2020-01-01T00:00:00Z');
  for (const checkout of [root, wt]) utimesSync(join(checkout, 'README.md'), past, past);
  const indexes = [join(root, '.git/index'), join(root, '.git/worktrees/160/index')];
  const before = indexes.map((p) => readFileSync(p));
  const gh = withFakeGh(dir, BACKLOG);
  assert.equal(gh.run(root, 'handoff', '--spec', SPEC_A).status, 0);
  assert.equal(gh.run(root, 'handoff', '--json').status, 0);
  assert.deepEqual(
    indexes.map((p) => readFileSync(p)),
    before,
    'no index refresh',
  );
  // Checked last: this `git status` may itself refresh the index.
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.deepEqual(
    gh.log().map((call) => call.split(' ').slice(0, 2).join(' ')),
    ['issue list', 'pr list', 'issue list', 'pr list'],
  );
});

test('handoff_missing_spec_file_group_prints', (t) => {
  const { dir, root } = repo(t);
  const gh = withFakeGh(dir, BACKLOG);
  const res = gh.run(root, 'handoff');
  assert.equal(res.status, 0, res.stderr);
  assert.match(standing(res.stdout), new RegExp(`^- ${SPEC_B}: ready: #170 · blocked: #171 · Implementation status: file not found$`, 'm'));
  const json = JSON.parse(gh.run(root, 'handoff', '--spec', SPEC_A, '--json').stdout);
  assert.deepEqual(json.unit, { spec: SPEC_A, found: false });
  assert.equal(json.groups.find((g) => g.spec === SPEC_B).openStatusItems, null);
  const unit = gh.run(root, 'handoff', '--spec', SPEC_A);
  assert.match(standing(unit.stdout), /^- Implementation status: file not found$/m);
});
