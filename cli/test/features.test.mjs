import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, reviewersFor } from '../lib/config.mjs';
import { detectStacks, suggestSetup, suggestValidate } from '../lib/detect.mjs';
import { PUBLISH_TARGETS } from '../lib/config.mjs';
import { PUBLISH_STEP_NAMES, releaseFindings, unblockable } from '../lib/tasks.mjs';
import { deepMerge } from '../lib/util.mjs';
import { classify, questions } from '../../hooks/fact-gate.mjs';

test('unblockable: only blocked tasks whose declared deps are all closed', () => {
  const tasks = [
    { number: 1, body: 'Depends on: #10' },
    { number: 2, body: 'Depends on: #10, #11' },
    { number: 3, body: 'blocked waiting on a product decision' },
  ];
  assert.deepEqual(unblockable(tasks, new Set([11])).map((t) => t.number), [1]);
});

test('reviewersFor: spec compliance first, general reviewers always, stack reviewers deduplicated', () => {
  const none = reviewersFor(DEFAULT_CONFIG);
  assert.equal(none[0], 'spec-compliance');
  assert.ok(['code-quality', 'security', 'tests', 'silent-failures'].every((r) => none.includes(r)));
  const full = reviewersFor(deepMerge(DEFAULT_CONFIG, { stacks: ['react', 'typescript', 'rust-tokio-postgres'] }));
  for (const r of ['react', 'typescript', 'types', 'rust', 'postgres']) assert.ok(full.includes(r), r);
  assert.equal(full.length, new Set(full).size);
});

test('detectStacks: monorepo with React app, Rust API on tokio-postgres, Playwright and i18n', () => {
  const root = mkdtempSync(join(tmpdir(), 'baton-detect-'));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  mkdirSync(join(root, 'crates/api'), { recursive: true });
  writeFileSync(join(root, 'apps/web/package.json'), JSON.stringify({ dependencies: { react: '19', 'react-intl': '7' }, devDependencies: { typescript: '5', '@playwright/test': '1' } }));
  writeFileSync(join(root, 'crates/api/Cargo.toml'), '[dependencies]\naxum = "0.8"\ntokio-postgres = "0.7"\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
  const d = detectStacks(root);
  for (const s of ['typescript', 'react', 'e2e', 'i18n', 'rust', 'rust-tokio-postgres', 'postgres', 'api']) assert.ok(d.stacks.includes(s), s);
  assert.ok(!d.stacks.includes('javascript'));
  assert.equal(d.packageManager, 'pnpm');
  assert.deepEqual(suggestSetup(d), [{ name: 'install', run: 'pnpm install --frozen-lockfile' }]);
  const v = suggestValidate(d, { remote: 'origin', baseBranch: 'develop' });
  assert.equal(new Set(v.map((x) => x.name)).size, v.length, 'validation step names are unique');
  assert.match(v.at(-1).run, /origin\/develop\.\.HEAD/);
});

test('fact gate: classifies targets and always asks for the user instruction', () => {
  assert.equal(classify('skills/spec/SKILL.md'), 'instruction');
  assert.equal(classify('apps/web/src/org.test.tsx'), 'test');
  assert.equal(classify('crates/api/tests/orgs.rs'), 'test');
  assert.equal(classify('migrations/0003_orgs.sql'), 'migration');
  assert.equal(classify('.env.local'), 'config');
  assert.equal(classify('docs/specs/x.md'), 'prose');
  assert.equal(classify('crates/api/src/orgs.rs'), 'code');
  for (const kind of ['code', 'test', 'migration', 'config', 'prose', 'instruction']) {
    assert.match(questions(kind, false, 'f').at(-1), /verbatim/);
  }
});

test('context: always-on rules, undetected stacks and common issues', async () => {
  const { buildContext, ALWAYS_RULES } = await import('../lib/context.mjs');
  const root = mkdtempSync(join(tmpdir(), 'baton-ctx-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { react: '19' }, devDependencies: { typescript: '5' } }));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/common-issues.md'), '# issues');
  const config = deepMerge(DEFAULT_CONFIG, { stacks: ['typescript'] });
  const text = buildContext({ root, found: true, config }, { pluginRoot: '/p', cwd: root });
  // The first rule gives way to the worktree rule while hooks.worktreeOnly is on (the default).
  for (const r of ALWAYS_RULES.slice(1)) assert.ok(text.includes(r));
  assert.match(text, /Detected but not enabled: react\./);
  assert.match(text, /common-issues\.md/);
  assert.match(text, /- common: \/p\/stacks\/common\.md/);
});

test('context_always_rules_include_deps', async (t) => {
  const { buildContext, ALWAYS_RULES } = await import('../lib/context.mjs');
  const { rmSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'baton-ctx-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const deps = ALWAYS_RULES.filter((r) => r.includes('baton:deps'));
  assert.deepEqual(deps, ['Before adding, upgrading or replacing a dependency, load baton:deps. Never take a version from memory.']);
  const text = buildContext({ root, found: true, config: DEFAULT_CONFIG }, { pluginRoot: '/p', cwd: root });
  const always = text.split('Always, even without loading a skill:\n')[1]?.split('\n\n')[0] ?? '';
  assert.ok(always.split('\n').includes(`- ${deps[0]}`), text);
});

test('reviewersFor: skips stack reviewers the diff does not touch, fails open on unknown files', () => {
  const config = deepMerge(DEFAULT_CONFIG, { stacks: ['react', 'typescript', 'rust-tokio-postgres', 'postgres'] });
  const frontOnly = reviewersFor(config, ['apps/web/src/OrgList.tsx', 'README.md']);
  assert.ok(frontOnly.includes('react') && frontOnly.includes('typescript'));
  assert.ok(!frontOnly.includes('rust') && !frontOnly.includes('postgres'));
  const backOnly = reviewersFor(config, ['crates/api/src/orgs.rs']);
  assert.ok(backOnly.includes('rust') && backOnly.includes('postgres') && !backOnly.includes('react'));
  const migration = reviewersFor(config, ['migrations/0004_events.sql']);
  assert.ok(migration.includes('postgres') && !migration.includes('rust'));
  const unknown = reviewersFor(config, ['infra/deploy.tf']);
  assert.deepEqual(unknown, reviewersFor(config));
  const docsOnly = reviewersFor(config, ['docs/specs/x.md']);
  assert.deepEqual(docsOnly, ['spec-compliance', 'code-quality', 'security', 'tests', 'silent-failures']);
});

test('prBody: closing reference first, author paragraphs, then one validation line', async () => {
  const { prBody } = await import('../lib/tasks.mjs');
  const body = prBody(42, 'Adds org list.\n\nTested by hand.\n', [{ name: 'test', run: 'cargo test' }, { name: 'lint', run: 'cargo clippy' }]);
  assert.equal(body, 'Closes #42\n\nAdds org list.\n\nTested by hand.\n\nValidated: test (`cargo test`), lint (`cargo clippy`)\n');
  assert.equal(prBody(7, '', []), 'Closes #7\n\nValidated: (no validation configured)\n');
});

test('provenance: satisfies ranges, lockfile parsing, lint and consumer check', async () => {
  const { satisfies, installedVersions, lintProvenance, factsVsInstalled, loadProvenance } = await import('../lib/provenance.mjs');
  assert.ok(satisfies('19.3.1', '>=19.2 <20'));
  assert.ok(!satisfies('19.1.0', '>=19.2 <20'));
  assert.ok(!satisfies('6.0.0', '>=5.102 <6'));
  assert.ok(satisfies('v8.30.1', '>=8.19'));

  const root = mkdtempSync(join(tmpdir(), 'baton-lock-'));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/react': { version: '19.1.0' }, 'node_modules/a/node_modules/@tanstack/query-core': { version: '5.96.2' } } }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n\npackages:\n\n  '@scope/pkg@1.2.3':\n    resolution: {}\n\n  react@19.3.1:\n    resolution: {}\n\nsnapshots:\n  react@19.3.1: {}\n");
  writeFileSync(join(root, 'Cargo.lock'), '[[package]]\nname = "axum"\nversion = "0.8.9"\n');
  const v = installedVersions(root);
  assert.deepEqual([...v.get('npm:react')].sort(), ['19.1.0', '19.3.1']);
  assert.deepEqual([...v.get('npm:@tanstack/query-core')], ['5.96.2']);
  assert.deepEqual([...v.get('npm:@scope/pkg')], ['1.2.3']);
  assert.deepEqual([...v.get('crates:axum')], ['0.8.9']);

  const pluginRoot = new URL('../..', import.meta.url).pathname;
  assert.deepEqual(lintProvenance(pluginRoot), [], 'provenance.json matches the repo');
  const findings = factsVsInstalled(loadProvenance(pluginRoot), v);
  assert.deepEqual(findings.map((f) => `${f.pkg}@${f.installed}`).sort(), ['npm:@tanstack/query-core@5.96.2', 'npm:react@19.1.0']);
});

test('reviewersFor: workflow files and SQL in code keep reviewers; reviewerFocus scopes files', async () => {
  const { reviewerFocus } = await import('../lib/config.mjs');
  const config = deepMerge(DEFAULT_CONFIG, { stacks: ['react', 'typescript', 'rust-tokio-postgres', 'postgres'] });
  assert.deepEqual(reviewersFor(config, ['.baton/config.json', 'README.md']), reviewersFor(config));
  assert.deepEqual(reviewersFor(config, ['.github/workflows/ci.yml']), reviewersFor(config));
  const sqlInTs = reviewersFor(config, ['apps/web/src/report.ts'], "+ const q = `SELECT id, name FROM orgs WHERE nation_id = $1`");
  assert.ok(sqlInTs.includes('postgres') && !sqlInTs.includes('rust'));
  assert.ok(!reviewersFor(config, ['apps/web/src/a.ts'], '+ const total = items.length').includes('postgres'));
  const files = ['apps/web/src/a.tsx', 'crates/api/src/b.rs'];
  assert.deepEqual(reviewerFocus(config, 'react', files), ['apps/web/src/a.tsx']);
  assert.deepEqual(reviewerFocus(config, 'security', files), files);
});

test('reviewState: review must match HEAD exactly', async () => {
  const { reviewState } = await import('../lib/tasks.mjs');
  const head = 'abcdef1234567890abcdef1234567890abcdef12';
  assert.ok(reviewState('## Reviews\nReviewed-at: abcdef1234\n', head).ok);
  assert.ok(reviewState(`Reviewed-at: ${head}`, head).ok);
  assert.match(reviewState('Reviewed-at: 1111111', head).reason, /commits were added after the review/);
  assert.match(reviewState('## Reviews\nnone', head).reason, /no `Reviewed-at/);
  assert.ok(!reviewState('Reviewed-at: <full sha>', head).ok);
});

test('the CLI entry point loads and prints help', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = new URL('../baton.mjs', import.meta.url).pathname;
  const res = spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /baton <command>/);
  for (const cmd of ['claim', 'start', 'reviewers', 'done', 'doctor', 'upstream']) assert.match(res.stdout, new RegExp(`\\b${cmd}\\b`));
});

const RELEASE_LINE = 'Releases: on demand with baton:release. Never edit CHANGELOG.md or version files in a task PR; the PR title is the changelog entry.';

test('context: mentions releases only when release.enabled', async (t) => {
  const { buildContext } = await import('../lib/context.mjs');
  const { rmSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'baton-ctx-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const off = buildContext({ root, found: true, config: DEFAULT_CONFIG }, { pluginRoot: '/p', cwd: root });
  assert.ok(!off.includes('baton:release') && !off.includes('CHANGELOG'));
  const on = buildContext({ root, found: true, config: deepMerge(DEFAULT_CONFIG, { release: { enabled: true } }) }, { pluginRoot: '/p', cwd: root });
  assert.ok(on.includes(RELEASE_LINE));
});

const WORKTREE_RULE =
  'Never edit or commit in the main checkout. Task work happens in the worktree from `baton start <n>`; anything else (specs, plans, docs, config) in one from `baton worktree add <name>`. Never use `git commit --no-verify`.';

test('context_uses_worktree_rule_when_on', async (t) => {
  const { buildContext, ALWAYS_RULES } = await import('../lib/context.mjs');
  const { installGuard } = await import('../lib/git-guard.mjs');
  const { rmSync, realpathSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'baton-ctx-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // installGuard and guardStatus run git in this process: isolate it from the user's git config.
  const saved = Object.fromEntries(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'CI', 'CLAUDE_CODE_REMOTE'].map((k) => [k, process.env[k]]));
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
  delete process.env.CI;
  delete process.env.CLAUDE_CODE_REMOTE;
  spawnSync('git', ['init', '-q'], { cwd: root });
  const rules = (text) => text.split('\n').filter((l) => l.startsWith('- '));

  const on = buildContext({ root, found: true, config: DEFAULT_CONFIG }, { pluginRoot: '/p', cwd: root });
  assert.equal(rules(on)[0], `- ${WORKTREE_RULE}`);
  assert.ok(!on.includes(ALWAYS_RULES[0]));
  for (const r of ALWAYS_RULES.slice(1)) assert.ok(on.includes(r));
  const missingLine = on.split('\n').filter((l) => l.includes('baton hooks install'));
  assert.equal(missingLine.length, 1, on);
  assert.match(missingLine[0], /git guard .*not installed/);
  process.env.CLAUDE_CODE_REMOTE = 'true';
  const remote = buildContext({ root, found: true, config: DEFAULT_CONFIG }, { pluginRoot: '/p', cwd: root });
  assert.ok(!remote.includes('baton hooks install'), 'a cloud session has no guard to install');
  delete process.env.CLAUDE_CODE_REMOTE;

  installGuard(root);
  const installed = buildContext({ root, found: true, config: DEFAULT_CONFIG }, { pluginRoot: '/p', cwd: root });
  assert.ok(!installed.includes('baton hooks install'), installed);
  assert.equal(installed, on.split('\n').filter((l) => !l.includes('baton hooks install')).join('\n'));

  const offConfig = deepMerge(DEFAULT_CONFIG, { hooks: { worktreeOnly: false } });
  rmSync(join(root, '.git/baton'), { recursive: true });
  const off = buildContext({ root, found: true, config: offConfig }, { pluginRoot: '/p', cwd: root });
  assert.equal(rules(off)[0], `- ${ALWAYS_RULES[0]}`);
  assert.ok(!off.includes(WORKTREE_RULE) && !off.includes('baton hooks install'));
  // Identical to the context before the switch existed: same lines with the old first rule.
  assert.equal(off, installed.replace(WORKTREE_RULE, ALWAYS_RULES[0]));
});

const STEP_NAMES = { npm: 'Publish to npm', crates: 'Publish to crates.io' };
const releaseConfig = (publish = []) => deepMerge(DEFAULT_CONFIG, { release: { enabled: true, publish } });
const releaseMessages = (config, files) => releaseFindings({ config, files }).map((f) => {
  assert.equal(f.kind, 'release');
  return f.message;
});
// A synthetic release workflow in the new layout; `extraJobs` are raw job blocks appended after `publish`.
const releaseWorkflow = (targets, { environment = 'publish', extraJobs = '' } = {}) => {
  const publish = targets.length === 0 ? '' : [
    '  publish:',
    '    needs: [release-please, build-npm, verify-crates]',
    ...(environment ? [`    environment: ${environment}`] : []),
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...targets.map((t) => `      - name: ${STEP_NAMES[t]}\n        run: echo ${t}`),
    '',
  ].join('\n');
  return `jobs:\n  release-please:\n    runs-on: ubuntu-latest\n${publish}${extraJobs}`;
};
const releaseRepo = (workflow) => ({
  'release-please-config.json': JSON.stringify({ 'include-component-in-tag': false, 'include-v-in-tag': true, packages: { '.': {} } }),
  '.release-please-manifest.json': '{ ".": "0.1.0" }',
  '.github/workflows/release.yml': workflow,
  'package.json': '{ "name": "x" }',
  'Cargo.toml': '[package]\nname = "x"\n',
});

test('releaseFindings_reports_old_publish_jobs', () => {
  for (const job of ['publish-npm', 'publish-crates']) {
    const files = releaseRepo(releaseWorkflow(['npm'], { extraJobs: `  ${job}:\n    needs: release-please\n` }));
    const found = releaseMessages(releaseConfig(['npm']), files);
    assert.equal(found.length, 1, job);
    assert.match(found[0], new RegExp(`${job}.*re-run the release step of baton:init.*environment.*publish`));
  }
  const old = releaseRepo('jobs:\n  release-please:\n    runs-on: x\n  publish-npm:\n    needs: release-please\n');
  assert.match(releaseMessages(releaseConfig(['npm']), old).join('\n'), /publish-npm.*re-run the release step of baton:init/);
});

test('releaseFindings_reports_publish_job_outside_publish_environment', () => {
  for (const environment of [null, 'production']) {
    const found = releaseMessages(releaseConfig(['npm']), releaseRepo(releaseWorkflow(['npm'], { environment })));
    assert.equal(found.length, 1, String(environment));
    assert.match(found[0], /publish job.*environment: publish/);
  }
  // An `environment: publish` in a later job doesn't count for the publish job.
  const elsewhere = releaseWorkflow(['npm'], { environment: null, extraJobs: '  other:\n    environment: publish\n' });
  assert.equal(releaseMessages(releaseConfig(['npm']), releaseRepo(elsewhere)).length, 1);
});

test('releaseFindings_reports_missing_target_step', () => {
  const config = releaseConfig(['npm', 'crates']);
  const onlyNpm = releaseMessages(config, releaseRepo(releaseWorkflow(['npm'])));
  assert.deepEqual(onlyNpm, ["release.publish has 'crates' but the publish job in .github/workflows/release.yml has no 'Publish to crates.io' step."]);
  const noJob = releaseMessages(releaseConfig(['npm']), releaseRepo(releaseWorkflow([])));
  assert.deepEqual(noJob, ["release.publish has 'npm' but the publish job in .github/workflows/release.yml has no 'Publish to npm' step."]);
  // A step in another job doesn't count.
  const other = releaseWorkflow([], { extraJobs: '  other:\n    steps:\n      - name: Publish to npm\n' });
  assert.equal(releaseMessages(releaseConfig(['npm']), releaseRepo(other)).length, 1);
});

test('releaseFindings_accepts_equivalent_spellings', () => {
  const check = (workflow) => releaseMessages(releaseConfig(['npm']), releaseRepo(workflow));
  const base = releaseWorkflow(['npm']);
  for (const spelling of ['"publish"', "'publish'", 'publish # the release gate', '{ name: publish }', '{ name: "publish", url: x }', '{ url: x, name: publish }']) {
    assert.deepEqual(check(base.replace('environment: publish', `environment: ${spelling}`)), [], spelling);
  }
  assert.deepEqual(check(base.replace('environment: publish', 'environment:\n      # gate\n      name: publish\n      url: x')), [], 'block form');
  assert.equal(check(base.replace('environment: publish', 'environment:\n      name: production')).length, 1);
  assert.deepEqual(check(base.replace('- name: Publish to npm', '- name: "Publish to npm"')), [], 'quoted step name');
  assert.deepEqual(check(base.replace('- name: Publish to npm', "-   name: 'Publish to npm' # last step")), [], 'spaced dash, comment');
  assert.deepEqual(check(base.replace('      - name: Publish to npm', "      - if: steps.registry.outputs.published != 'true'\n        name: Publish to npm")), [], 'name after another step key');
  const nested = base.replace('    environment: publish\n', '').replace('        run: echo npm', '        with:\n          environment: publish');
  assert.equal(check(nested).length, 1, 'environment under a step is not the job environment');
  assert.deepEqual(check(base.replace(/\n/g, '\r\n')), [], 'CRLF');
  assert.deepEqual(check(base.replace(/^( +)/gm, '$1$1')), [], '4-space indentation');
  assert.deepEqual(check(`env:\n  publish: yes\n${base}`), [], 'env block before jobs');
  assert.deepEqual(check(base.replace('    runs-on', '  # note\n    runs-on')), [], 'comment inside the job');
  assert.deepEqual(check(base.replace('  publish:', '  publish: # last')), [], 'job header comment');
});

test('releaseFindings: every known publish target has a step name, and an unknown one does not throw', () => {
  for (const target of PUBLISH_TARGETS) assert.ok(PUBLISH_STEP_NAMES[target], target);
  assert.doesNotThrow(() => releaseMessages(releaseConfig(['nope']), releaseRepo(releaseWorkflow([]))));
});

test('releaseFindings_accepts_new_layout', () => {
  assert.deepEqual(releaseMessages(releaseConfig(['npm', 'crates']), releaseRepo(releaseWorkflow(['npm', 'crates']))), []);
  assert.deepEqual(releaseMessages(releaseConfig(['crates']), releaseRepo(releaseWorkflow(['crates']))), []);
  assert.deepEqual(releaseMessages(releaseConfig([]), releaseRepo(releaseWorkflow([]))), []);
});

// The baton:init release step's trim of templates/release/release.yml for `publish`: a marker line
// deletes the job or step block below it (the comments under the marker, the key or `- ` line, every
// more-indented line and the blank lines that follow) unless its target is kept, and kept blocks
// lose only the marker line. Deleted job names leave `publish`'s `needs:`. When no publish step is
// left, `publish` goes with the comment above it, and so does the `# Publishing:` comment block.
const INIT_MARKER = /^( *)# baton:init: keep this (job|step) only when release\.publish has "(\w+)"$/;
const TARGET_JOBS = { npm: ['build-npm', 'dry-run-npm'], crates: ['verify-crates'] };
const lineIndent = (line) => line.length - line.trimStart().length;
const trimReleaseTemplate = (yml, publish) => {
  const lines = yml.split('\n');
  const out = [];
  const deletedJobs = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(INIT_MARKER);
    if (!marker) {
      out.push(lines[i]);
      continue;
    }
    if (publish.includes(marker[3])) continue;
    const indent = marker[1].length;
    let k = i + 1;
    while (k < lines.length && lineIndent(lines[k]) === indent && lines[k].trim().startsWith('#')) k++;
    if (marker[2] === 'job') deletedJobs.push(lines[k].trim().replace(/:$/, ''));
    k++;
    while (k < lines.length && (!lines[k].trim() || lineIndent(lines[k]) > indent)) k++;
    i = k - 1;
  }
  const trimmed = out.join('\n').replace(/^( {4}needs: \[)(.*)\]$/m, (_, head, list) => `${head}${list.split(', ').filter((n) => !deletedJobs.includes(n)).join(', ')}]`);
  if (/^ {6}- /m.test(trimmed.split(/^ {2}publish:$/m)[1] ?? '')) return trimmed;
  return trimmed
    .replace(/(?:^ {2}#.*\n)*^ {2}publish:\n[\s\S]*$/m, '')
    .replace(/^ {2}# Publishing:.*\n(?: {2}#.*\n)*\n*/m, '');
};
// Job name -> the jobs its `needs:` names, scalar or list form.
const jobNeeds = (yml) => {
  const jobs = {};
  let current = null;
  for (const line of yml.split(/^jobs:$/m)[1].split('\n')) {
    const key = line.match(/^ {2}([\w-]+):$/);
    if (key) jobs[(current = key[1])] = [];
    const needs = current && line.match(/^ {4}needs: (.*)$/);
    if (needs) jobs[current] = needs[1].replace(/^\[|\]$/g, '').split(',').map((n) => n.trim());
  }
  return jobs;
};

test('releaseFindings: the release template trimmed by baton:init for each target reports nothing', () => {
  const template = readFileSync(new URL('../../templates/release/release.yml', import.meta.url), 'utf8');
  for (const publish of [['npm', 'crates'], ['npm'], ['crates'], []]) {
    const yml = trimReleaseTemplate(template, publish);
    const label = `publish ${JSON.stringify(publish)}`;
    assert.doesNotMatch(yml, /baton:init: keep/, `${label}: no marker left`);
    const needs = jobNeeds(yml);
    const jobs = Object.keys(needs);
    assert.equal(jobs.includes('publish'), publish.length > 0, `${label}: publish job`);
    if (!publish.length) assert.doesNotMatch(yml, /# Publishing:/, `${label}: no publishing comment`);
    for (const [target, targetJobs] of Object.entries(TARGET_JOBS)) {
      const kept = publish.includes(target);
      for (const name of targetJobs) assert.equal(jobs.includes(name), kept, `${label}: job ${name}`);
      assert.equal(yml.includes(`name: ${PUBLISH_STEP_NAMES[target]}\n`), kept, `${label}: step ${PUBLISH_STEP_NAMES[target]}`);
    }
    for (const [name, list] of Object.entries(needs)) {
      for (const need of list) assert.ok(jobs.includes(need), `${label}: ${name} needs ${need}`);
    }
    assert.deepEqual(releaseMessages(releaseConfig(publish), releaseRepo(yml)), [], label);
  }
});

test('releaseFindings: reports each mismatch between the release config and the repo', () => {
  const on = releaseConfig;
  const goodTags = JSON.stringify({ 'include-component-in-tag': false, 'include-v-in-tag': true, packages: { '.': {} } });
  const workflow = (...targets) => releaseWorkflow(targets);
  const complete = {
    'release-please-config.json': goodTags,
    '.release-please-manifest.json': '{ ".": "0.1.0" }',
    '.github/workflows/release.yml': workflow(),
  };
  const messages = releaseMessages;

  assert.deepEqual(messages(DEFAULT_CONFIG, {}), []);
  assert.deepEqual(messages(on(), complete), []);

  const [missing] = messages(on(), { 'release-please-config.json': goodTags });
  assert.match(missing, /release\.enabled is true.*\.release-please-manifest\.json, \.github\/workflows\/release\.yml/);
  const [leftover] = messages(DEFAULT_CONFIG, { '.github/workflows/release.yml': workflow() });
  assert.match(leftover, /release\.enabled is false.*\.github\/workflows\/release\.yml/);

  for (const tags of [{ 'include-v-in-tag': true }, { 'include-component-in-tag': false, 'include-v-in-tag': false }, { 'include-component-in-tag': false, 'include-v-in-tag': true, packages: { '.': { 'include-component-in-tag': true } } }]) {
    const found = messages(on(), { ...complete, 'release-please-config.json': JSON.stringify(tags) });
    assert.equal(found.length, 1, JSON.stringify(tags));
    assert.match(found[0], /include-component-in-tag: false.*include-v-in-tag: true/);
  }
  assert.match(messages(on(), { ...complete, 'release-please-config.json': '{ nope' })[0], /not valid JSON/);

  const npmJobs = { ...complete, '.github/workflows/release.yml': workflow('npm') };
  assert.match(messages(on(['npm']), npmJobs).join('\n'), /npm.*no root package\.json/);
  assert.match(messages(on(['npm']), { ...npmJobs, 'package.json': '{ "private": true }' }).join('\n'), /npm.*private/);
  assert.match(messages(on(['npm']), { ...npmJobs, 'package.json': '{ "private": "true" }' }).join('\n'), /npm.*private/, 'npm refuses any truthy private');
  assert.deepEqual(messages(on(['npm']), { ...npmJobs, 'package.json': '{ "name": "x" }' }), []);

  const crateJobs = { ...complete, '.github/workflows/release.yml': workflow('crates') };
  assert.match(messages(on(['crates']), crateJobs).join('\n'), /crates.*no root Cargo\.toml/);
  assert.match(messages(on(['crates']), { ...crateJobs, 'Cargo.toml': '[package]\nname = "x"\npublish = false\n' }).join('\n'), /crates.*publish = false/);
  assert.deepEqual(messages(on(['crates']), { ...crateJobs, 'Cargo.toml': '[package]\nname = "x"\n' }), []);

});

test('baton init writes the release switch, off', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync, rmSync } = await import('node:fs');
  const cli = new URL('../baton.mjs', import.meta.url).pathname;
  const root = mkdtempSync(join(tmpdir(), 'baton-init-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const res = spawnSync(process.execPath, [cli, 'init'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.baton/config.json'), 'utf8')).release, { enabled: false, publish: [] });
});

test('baton done refuses CHANGELOG.md edits by the base branch release switch, offline', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { rmSync } = await import('node:fs');
  const cli = new URL('../baton.mjs', import.meta.url).pathname;
  const refusal = 'CHANGELOG.md is generated at release. Revert it; the PR title is the changelog entry.';
  // No remote is configured, so nothing can reach the network: a run past the guard fails at push.
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GH_TOKEN: '' };
  const sh = (root, ...args) => {
    const res = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
  };
  const config = (enabled) => JSON.stringify({ release: { enabled }, workflow: { requireReview: false } });
  // baseEnabled: true/false writes a base config with that switch; null commits no base config.
  const repo = (baseEnabled) => {
    const root = mkdtempSync(join(tmpdir(), 'baton-done-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    sh(root, 'init', '-q', '-b', 'main');
    mkdirSync(join(root, '.baton'));
    if (baseEnabled !== null) writeFileSync(join(root, '.baton/config.json'), config(baseEnabled));
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n');
    sh(root, 'add', '-A');
    sh(root, 'commit', '-qm', 'init');
    sh(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    sh(root, 'checkout', '-qb', `${DEFAULT_CONFIG.git.branchPrefix}/1-x`);
    return root;
  };
  const done = (root, ...args) => spawnSync(process.execPath, [cli, 'done', ...args], { cwd: root, env, encoding: 'utf8' });

  const edited = repo(true);
  writeFileSync(join(edited, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n- x\n');
  sh(edited, 'commit', '-qam', 'edit');
  for (const flags of [['--draft'], ['--skip-review', 'r']]) {
    const res = done(edited, ...flags);
    assert.notEqual(res.status, 0);
    assert.ok(res.stderr.includes(refusal), res.stderr);
  }

  const renamed = repo(true);
  sh(renamed, 'mv', 'CHANGELOG.md', 'HISTORY.md');
  sh(renamed, 'commit', '-qm', 'rename');
  assert.ok(done(renamed, '--draft').stderr.includes(refusal), 'a rename away from CHANGELOG.md is still an edit');

  const turningOn = repo(false);
  writeFileSync(join(turningOn, '.baton/config.json'), config(true));
  writeFileSync(join(turningOn, 'CHANGELOG.md'), '');
  sh(turningOn, 'commit', '-qam', 'enable releases');
  const allowed = done(turningOn, '--draft');
  assert.notEqual(allowed.status, 0, 'fails later, at push: there is no remote');
  assert.ok(!allowed.stderr.includes(refusal), allowed.stderr);
  assert.match(allowed.stderr, /push/);

  const noBaseConfig = repo(null);
  writeFileSync(join(noBaseConfig, '.baton/config.json'), config(true));
  writeFileSync(join(noBaseConfig, 'CHANGELOG.md'), '');
  sh(noBaseConfig, 'add', '-A');
  sh(noBaseConfig, 'commit', '-qm', 'adopt baton with releases');
  const adopted = done(noBaseConfig, '--draft');
  assert.ok(!adopted.stderr.includes(refusal), adopted.stderr);
  assert.match(adopted.stderr, /push/);
});

test('baton doctor reports missing release files, offline', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { rmSync } = await import('node:fs');
  const cli = new URL('../baton.mjs', import.meta.url).pathname;
  const root = mkdtempSync(join(tmpdir(), 'baton-doctor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, '.baton'));
  writeFileSync(join(root, '.baton/config.json'), JSON.stringify({ git: { mergeStrategy: 'squash' }, release: { enabled: true, publish: [] } }));
  const res = spawnSync(process.execPath, [cli, 'doctor', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 1, res.stderr);
  const release = JSON.parse(res.stdout).filter((f) => f.kind === 'release');
  assert.equal(release.length, 1);
  for (const file of ['release-please-config.json', '.release-please-manifest.json', '.github/workflows/release.yml']) assert.ok(release[0].message.includes(file), file);
});

test('every reviewer brief ends its report with the same Declined to judge block', () => {
  const dir = new URL('../../reviewers/', import.meta.url).pathname;
  const tails = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.match(text, /^## Declined to judge$/m, f);
    const start = text.lastIndexOf('\nLast, after the findings');
    assert.ok(start >= 0, f);
    return text.slice(start);
  });
  assert.ok(tails.length > 0);
  for (const tail of tails) assert.equal(tail, tails[0]);
});
