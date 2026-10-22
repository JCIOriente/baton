import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG, reviewersFor } from '../lib/config.mjs';
import { detectStacks, suggestSetup, suggestValidate } from '../lib/detect.mjs';
import { unblockable } from '../lib/tasks.mjs';
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
  for (const r of ALWAYS_RULES) assert.ok(text.includes(r));
  assert.match(text, /Detected but not enabled: react\./);
  assert.match(text, /common-issues\.md/);
  assert.match(text, /- common: \/p\/stacks\/common\.md/);
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

test('prBody: closing reference first, author sections, then validation', async () => {
  const { prBody } = await import('../lib/tasks.mjs');
  const body = prBody(42, '## Summary\nAdds org list.\n', [{ name: 'test', run: 'cargo test' }]);
  assert.match(body, /^Closes #42\n\n## Summary\nAdds org list\.\n\n## Validation\n- \[x\] test: `cargo test`\n$/);
  assert.equal(prBody(7, '', []), 'Closes #7\n\n## Validation\n- (no validation configured)\n');
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
