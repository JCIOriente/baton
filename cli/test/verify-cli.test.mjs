import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

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

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

function baton(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
}

/** A clone of a bare "origin" whose main holds `config` as .baton/config.json. */
function repo(t, config) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-verify-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, 'origin.git');
  const root = join(dir, 'acme');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, root);
  git(root, 'checkout', '-qb', 'main');
  mkdirSync(join(root, '.baton'));
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify(config));
  writeFileSync(join(root, '.gitignore'), 'ran.log\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  git(root, 'push', '-q', 'origin', 'main');
  return { dir, root, base: join(dir, 'acme-worktrees') };
}

/** A step that records its name in ran.log, then exits with `code`. */
const step = (name, code = 0, extra = {}) => ({ name, run: `echo ${name} >> ran.log; exit ${code}`, ...extra });
const ran = (root) => readFileSync(join(root, 'ran.log'), 'utf8').trim().split('\n');

test('verify runs only local-stage steps by default', (t) => {
  const { root } = repo(t, {
    validate: [
      step('fmt', 0, { stages: ['commit'] }),
      step('lint', 0, { gates: ['lint'] }),
      step('e2e', 0, { stages: ['ci'] }),
      step('tests', 0, { stages: ['local'] }),
    ],
  });
  const res = baton(root, 'verify');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(ran(root), ['lint', 'tests']);
  assert.match(res.stderr, /▶ \[verify\] lint: echo lint/);
  assert.equal(res.stdout, ['verify (local): 2 passed', '  ✔ lint [lint]', '  ✔ tests [no gate]', 'not in this stage: fmt (commit), e2e (ci)', ''].join('\n'));

  rmSync(join(root, 'ran.log'));
  const ci = baton(root, 'verify', '--stage', 'ci');
  assert.equal(ci.status, 0, ci.stderr);
  assert.deepEqual(ran(root), ['lint', 'e2e']);
});

test('verify --stage rejects an unknown stage', (t) => {
  const { root } = repo(t, { validate: [step('lint')] });
  const res = baton(root, 'verify', '--stage', 'prod');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown stage 'prod'/);
  assert.match(res.stderr, /hint: .*commit, local, ci/);
});

test('verify continues past a failing advisory step and exits 0', (t) => {
  const { root } = repo(t, {
    validate: [
      step('api-break', 1, { gates: ['publish'], blocking: false, reason: 'needs a published baseline first' }),
      step('tests', 0, { gates: ['unit-tests'] }),
    ],
  });
  const res = baton(root, 'verify');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(ran(root), ['api-break', 'tests']);
  assert.match(res.stderr, /✖ api-break failed \(exit 1\)/);
  assert.equal(
    res.stdout,
    ['verify (local): 1 passed, 1 advisory failed', '  ✖ api-break [publish] advisory: needs a published baseline first', '  ✔ tests [unit-tests]', ''].join(
      '\n',
    ),
  );
});

test('verify stops at a blocking failure and marks later steps not-run', (t) => {
  const { root } = repo(t, {
    validate: [step('lint', 0, { gates: ['lint'] }), step('tests', 2, { gates: ['unit-tests'] }), step('build', 0, { gates: ['build'] })],
  });
  const res = baton(root, 'verify');
  assert.equal(res.status, 1);
  assert.deepEqual(ran(root), ['lint', 'tests']);
  assert.equal(res.stdout, ['verify (local): 1 passed, 1 failed, 1 not run', '  ✔ lint [lint]', '  ✖ tests [unit-tests]', '  · build not run', ''].join('\n'));
});

test('verify reports the advisory failure and stops at the blocking one', (t) => {
  const { root } = repo(t, {
    validate: [step('docs', 1, { gates: ['format'], blocking: false, reason: 'slow' }), step('tests', 1, { gates: ['unit-tests'] }), step('build', 0)],
  });
  const res = baton(root, 'verify', '--json');
  assert.equal(res.status, 1);
  const out = JSON.parse(res.stdout);
  assert.equal(out.ok, false);
  assert.deepEqual(
    out.results.map((r) => [r.name, r.status, r.code]),
    [
      ['docs', 'failed', 1],
      ['tests', 'failed', 1],
      ['build', 'not-run', null],
    ],
  );
});

test('verify fails the step whose cwd is missing', (t) => {
  const { root } = repo(t, { validate: [step('app', 0, { cwd: 'apps/missing' }), step('tests')] });
  const res = baton(root, 'verify', '--json');
  assert.equal(res.status, 1);
  const out = JSON.parse(res.stdout);
  assert.deepEqual(
    out.results.map((r) => [r.name, r.status]),
    [
      ['app', 'failed'],
      ['tests', 'not-run'],
    ],
  );
  assert.match(res.stderr, /✖ app failed \(cwd apps\/missing not found\)/);
  assert.equal(out.results[0].code, null);
});

test('verify --only by gate name prints the narrowed line', (t) => {
  const { root } = repo(t, { validate: [step('lint', 0, { gates: ['format', 'lint'] }), step('tests', 0, { gates: ['unit-tests'] })] });
  const res = baton(root, 'verify', '--only', 'format');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(ran(root), ['lint']);
  assert.equal(res.stdout, ['verify (local): 1 passed', '  ✔ lint [format, lint]', 'Narrowed run (--only format): not a gate run.', ''].join('\n'));

  const json = JSON.parse(baton(root, 'verify', '--only', 'tests', '--json').stdout);
  assert.equal(json.narrowed, true);
  assert.deepEqual(
    json.results.map((r) => r.name),
    ['tests'],
  );
});

test('verify --only selects the union of name and gate matches', (t) => {
  const { root } = repo(t, { validate: [step('lint', 0, { gates: ['lint'] }), step('other'), step('style', 0, { gates: ['format', 'lint'] })] });
  const res = baton(root, 'verify', '--only', 'lint', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(
    JSON.parse(res.stdout).results.map((r) => r.name),
    ['lint', 'style'],
  );
});

test('verify --only with no match in the stage exits 1', (t) => {
  const { root } = repo(t, { validate: [step('lint', 0, { gates: ['lint'] }), step('tests'), step('e2e', 0, { gates: ['e2e'], stages: ['ci'] })] });
  const res = baton(root, 'verify', '--only', 'e2e');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /No step or gate named 'e2e' in stage 'local'/);
  assert.match(res.stderr, /Steps in stage 'local': lint, tests/);
});

test('verify --stage commit with no commit steps exits 0', (t) => {
  const { root } = repo(t, { validate: [step('lint')] });
  const res = baton(root, 'verify', '--stage', 'commit');
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "No validation steps in stage 'commit'.\n");
});

test('verify --json has the spec shape', (t) => {
  const { root } = repo(t, {
    gates: { skip: { 'unused-deps': 'one devDependency (Biome), used by the lint step' } },
    validate: [
      step('lint', 0, { gates: ['format', 'lint'] }),
      step('api', 1, { gates: ['publish'], blocking: false, reason: 'no baseline' }),
      step('e2e', 0, { gates: ['e2e'], stages: ['ci'] }),
    ],
  });
  const res = baton(root, 'verify', '--json');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(res.stdout), {
    ok: true,
    stage: 'local',
    narrowed: false,
    results: [
      { name: 'lint', run: 'echo lint >> ran.log; exit 0', gates: ['format', 'lint'], blocking: true, status: 'passed', code: 0 },
      { name: 'api', run: 'echo api >> ran.log; exit 1', gates: ['publish'], blocking: false, status: 'failed', code: 1 },
    ],
    notInStage: [{ name: 'e2e', stages: ['ci'] }],
    skipped: [{ gate: 'unused-deps', reason: 'one devDependency (Biome), used by the lint step' }],
  });
});

test('verify lists skipped gates in the summary', (t) => {
  const { root } = repo(t, {
    gates: { skip: { 'unused-deps': 'one devDependency (Biome), used by the lint step' } },
    validate: [step('lint', 0, { gates: ['lint'] })],
  });
  const res = baton(root, 'verify');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^skipped gates: unused-deps \(one devDependency \(Biome\), used by the lint step\)$/m);
});

test('doctor runs with a validate step', (t) => {
  const { root } = repo(t, { validate: [{ run: 'true', gates: ['lint'] }] });
  const res = baton(root, 'doctor');
  assert.doesNotMatch(res.stderr, /ReferenceError|unexpected error/);
  assert.ok(res.status === 0 || res.status === 1, res.stderr);
});

test('verify on an old config keeps the step lines and shows no gate', (t) => {
  const { root } = repo(t, { validate: [{ name: 'ci', run: 'echo ci >> ran.log' }] });
  const res = baton(root, 'verify');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /▶ \[verify\] ci: echo ci >> ran.log\n/);
  assert.match(res.stderr, /✔ ci\n/);
  assert.equal(res.stdout, 'verify (local): 1 passed\n  ✔ ci [no gate]\n');
});

/**
 * A fake `gh` first on PATH that answers as user `me`, who already holds the claim on any issue.
 * Each call's arguments go to <dir>/gh.log as one JSON line; `pr create` answers with a PR URL.
 */
function withFakeGh(dir) {
  const log = join(dir, 'gh.log');
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const issue = {
    number: 12,
    title: 'Task',
    body: '',
    state: 'OPEN',
    assignees: [],
    labels: [],
    url: '',
    comments: [{ author: { login: 'me' }, body: '<!-- baton:claim user=me nonce=abc -->' }],
  };
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}
const a = process.argv.slice(2);
require('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n');
if (a[0] === 'api') console.log('me');
else if (a[0] === 'issue' && a[1] === 'list') console.log('[]');
else if (a[0] === 'issue' && a[1] === 'view') console.log(JSON.stringify(${JSON.stringify(issue)}));
else if (a[0] === 'pr' && a[1] === 'list') console.log('[]');
else if (a[0] === 'pr' && a[1] === 'create') console.log('https://example.test/pr/1');
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...env, PATH: `${bin}:${env.PATH}` }, encoding: 'utf8' });
}

test('start baseline reports a failing advisory step', (t) => {
  const { dir, root } = repo(t, {
    validate: [
      step('api', 1, { gates: ['publish'], blocking: false, reason: 'needs a published baseline first' }),
      step('tests', 0, { gates: ['unit-tests'] }),
    ],
  });
  const res = withFakeGh(dir)(root, 'start', '12');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /baseline: validation passes before any change\./);
  assert.match(res.stdout, /^baseline: advisory 'api' fails \(needs a published baseline first\)$/m);
});

test('start baseline names the first failing blocking step', (t) => {
  const { dir, root } = repo(t, {
    validate: [step('docs', 1, { gates: ['format'], blocking: false, reason: 'slow' }), step('tests', 1, { gates: ['unit-tests'] }), step('build', 0)],
  });
  const res = withFakeGh(dir)(root, 'start', '12');
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /baseline: 'tests' ALREADY FAILS/);
  assert.match(res.stdout, /^baseline: advisory 'docs' fails \(slow\)$/m);
});

test('done runs only the local stage and opens the PR past an advisory failure', (t) => {
  const { dir, root, base } = repo(t, {
    validate: [
      step('api', 1, { gates: ['publish'], blocking: false, reason: 'no baseline yet' }),
      step('tests', 0, { gates: ['unit-tests'] }),
      step('e2e', 1, { gates: ['e2e'], stages: ['ci'] }),
    ],
  });
  const path = join(base, 'task-12-task');
  git(root, 'worktree', 'add', '-q', '-b', 'task/12-task', path, 'main');
  git(path, 'commit', '-q', '--allow-empty', '-m', 'feat: x');
  const res = withFakeGh(dir)(path, 'done', '--draft');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(ran(path), ['api', 'tests']);
  const create = readFileSync(join(dir, 'gh.log'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .find((a) => a[0] === 'pr' && a[1] === 'create');
  const body = create[create.indexOf('--body') + 1];
  assert.match(body, /^Validated \(local\): tests \(`echo tests >> ran.log; exit 0`\)$/m);
  assert.match(body, /^Advisory failed: api \(`echo api >> ran.log; exit 1`\): no baseline yet$/m);
  assert.match(body, /^CI only: e2e \(`echo e2e >> ran.log; exit 1`\)$/m);
});

/** A linked worktree of `root` on a new branch whose .baton/config.json is `config`. */
function linkedWithConfig(root, base, config) {
  const wt = join(base, 'feat');
  git(root, 'worktree', 'add', '-q', '-b', 'feat', wt, 'main');
  writeFileSync(join(wt, '.baton/config.json'), JSON.stringify(config));
  git(wt, 'commit', '-q', '--allow-empty', '-am', 'change the gates');
  return wt;
}

test('verify in a linked worktree runs its own validate steps', (t) => {
  const { root, base } = repo(t, { validate: [step('main-step')] });
  const wt = linkedWithConfig(root, base, { validate: [step('branch-step')] });
  const res = baton(wt, 'verify');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(ran(wt), ['branch-step']);
});

test('doctor in a linked worktree checks its own validate steps', (t) => {
  const { root, base } = repo(t, { validate: [{ name: 'main-step', run: 'baton-main-only-tool' }] });
  const wt = linkedWithConfig(root, base, { validate: [{ name: 'branch-step', run: 'baton-branch-only-tool' }] });
  const res = baton(wt, 'doctor', '--json');
  const tools = JSON.parse(res.stdout)
    .filter((f) => f.kind === 'tool')
    .map((f) => f.message);
  assert.deepEqual(tools, ["'baton-branch-only-tool' (used by 'branch-step') is not on PATH"]);
});

test('doctor in a linked worktree checks the files of that worktree', (t) => {
  // Every file the checks read exists only in the linked worktree.
  const { root, base } = repo(t, { validate: [step('tests', 0, { gates: ['unit-tests'] })] });
  const wt = linkedWithConfig(root, base, { validate: [step('tests', 0, { gates: ['unit-tests'], cwd: 'pkg' })] });
  mkdirSync(join(wt, 'pkg'));
  writeFileSync(join(wt, 'package.json'), JSON.stringify({ dependencies: { react: '19.1.0' } }));
  writeFileSync(join(wt, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/react': { version: '19.1.0' } } }));
  writeFileSync(join(wt, 'release-please-config.json'), '{}');
  const messages = JSON.parse(baton(wt, 'doctor', '--json').stdout).map((f) => `[${f.kind}] ${f.message}`);
  const has = (prefix) =>
    assert.ok(
      messages.some((m) => m.startsWith(prefix)),
      `${prefix}\n${messages.join('\n')}`,
    );
  has("[gates] gate 'install' applies (a package.json with dependencies");
  has('[stacks] Detected but not enabled: ');
  has('[release] release.enabled is false but release-please-config.json exists');
  assert.ok(
    messages.some((m) => m.includes('react 19.1.0 installed')),
    messages.join('\n'),
  );
  assert.ok(!messages.some((m) => m.includes("cwd 'pkg'")), messages.join('\n'));
});

test('verify and doctor on a branch without the config of the main checkout say to update the branch', (t) => {
  const { root, base } = repo(t, { validate: [step('tests')] });
  const wt = join(base, 'old');
  git(root, 'worktree', 'add', '-q', '-b', 'old', wt, 'main');
  git(wt, 'rm', '-q', '.baton/config.json');
  git(wt, 'commit', '-qm', 'a branch from before baton');
  const expected = "This checkout's branch has no .baton/config.json, but the main checkout has one";
  const verify = baton(wt, 'verify');
  assert.equal(verify.status, 1);
  assert.ok(verify.stderr.includes(expected), verify.stderr);
  assert.match(verify.stderr, /hint: Rebase or merge the base branch into this branch/);
  assert.doesNotMatch(verify.stderr, /Run `baton init` first/);
  const config = JSON.parse(baton(wt, 'doctor', '--json').stdout).filter((f) => f.kind === 'config');
  assert.equal(config.length, 1, JSON.stringify(config));
  assert.ok(config[0].message.startsWith(expected), config[0].message);
  assert.doesNotMatch(config[0].message, /\(run `baton init`\)/);
});
