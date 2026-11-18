import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hasDependencies } from '../lib/detect.mjs';
import { applicableGates, coverageFindings, DEFAULT_STAGES, GATES, normalizeStep, orderFindings, STAGES, STATIC_GATES } from '../lib/gates.mjs';

const repo = (files = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'gates-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};
const names = (root, config = {}) => applicableGates({ root, config: { stacks: [], release: { publish: [] }, ...config } }).map((g) => g.gate);
const BASE = ['secrets', 'format', 'lint', 'structure', 'unit-tests'];

test('catalog order and static set', () => {
  assert.equal(GATES.length, 17);
  assert.equal(GATES[0], 'secrets');
  assert.equal(GATES[16], 'publish');
  assert.deepEqual([...STATIC_GATES], ['secrets', 'install', 'format', 'lint', 'structure', 'types', 'generated', 'dead-code', 'unused-deps', 'audit']);
  assert.deepEqual([...STAGES], ['commit', 'local', 'ci']);
  assert.deepEqual([...DEFAULT_STAGES], ['local', 'ci']);
});

test('normalizeStep fills defaults', () => {
  assert.deepEqual(normalizeStep({ run: 'x' }), { name: 'x', run: 'x', gates: [], stages: ['local', 'ci'], blocking: true });
  const n = normalizeStep({ name: 'n', run: 'x', cwd: 'a', gates: ['lint'], blocking: false, reason: 'r' });
  assert.deepEqual(n, { name: 'n', run: 'x', cwd: 'a', gates: ['lint'], stages: ['local', 'ci'], blocking: false, reason: 'r' });
});

test('hasDependencies: an unparseable package.json counts as having dependencies', () => {
  assert.equal(hasDependencies(repo({ 'package.json': '{oops' })), true);
});

test('hasDependencies', () => {
  assert.equal(hasDependencies(repo()), false);
  assert.equal(hasDependencies(repo({ 'package.json': '{}' })), false);
  assert.equal(hasDependencies(repo({ 'package.json': '{"dependencies":{"a":"1"}}' })), true);
});

test('applicableGates: always gates only in an empty repo', () => {
  assert.deepEqual(names(repo()), BASE);
});

test('applicableGates applies structure always', () => {
  const r = applicableGates({ root: repo(), config: {} });
  assert.deepEqual(
    r.find((g) => g.gate === 'structure'),
    { gate: 'structure', why: 'always' },
  );
});

test('applicableGates: package.json with only devDependencies adds install, audit, unused-deps', () => {
  const root = repo({ 'package.json': '{"devDependencies":{"a":"1"}}' });
  assert.deepEqual(names(root), ['secrets', 'install', 'format', 'lint', 'structure', 'unused-deps', 'audit', 'unit-tests']);
});

test('applicableGates: package.json without dependencies adds nothing', () => {
  assert.deepEqual(names(repo({ 'package.json': '{"name":"x"}' })), BASE);
});

test('applicableGates: Cargo.toml one level down adds install, audit, unused-deps', () => {
  const root = repo({ 'crates/a/Cargo.toml': '[package]\n' });
  assert.deepEqual(names(root), ['secrets', 'install', 'format', 'lint', 'structure', 'unused-deps', 'audit', 'unit-tests']);
});

test('applicableGates: stack rows', () => {
  const rows = {
    typescript: ['secrets', 'format', 'lint', 'structure', 'types', 'unit-tests'],
    rust: ['secrets', 'format', 'lint', 'structure', 'types', 'unit-tests'],
    'rust-tokio-postgres': ['secrets', 'format', 'lint', 'structure', 'types', 'unit-tests'],
    postgres: ['secrets', 'format', 'lint', 'structure', 'migrations', 'unit-tests'],
    e2e: ['secrets', 'format', 'lint', 'structure', 'unit-tests', 'e2e'],
    react: ['secrets', 'format', 'lint', 'structure', 'unit-tests', 'build'],
    javascript: BASE,
    node: BASE,
  };
  for (const [stack, expected] of Object.entries(rows)) assert.deepEqual(names(repo(), { stacks: [stack] }), expected, stack);
});

test('applicableGates: release.publish non-empty adds publish', () => {
  const r = applicableGates({ root: repo(), config: { stacks: [], release: { publish: ['npm'] } } });
  assert.deepEqual(
    r.map((g) => g.gate),
    [...BASE, 'publish'],
  );
  assert.ok(r.every((g) => g.why));
});

test('applicableGates: never-applicable gates are never returned', () => {
  const all = names(repo({ 'package.json': '{"dependencies":{"a":"1"}}' }), {
    stacks: ['typescript', 'react', 'postgres', 'e2e'],
    release: { publish: ['npm'] },
  });
  for (const g of ['generated', 'dead-code', 'integration-tests', 'budget']) assert.ok(!all.includes(g), g);
});

test('coverageFindings: an uncovered gate is reported', () => {
  const f = coverageFindings({ validate: [{ name: 's', run: 'x', gates: ['secrets'] }], gates: { skip: {} } }, [
    { gate: 'lint', why: 'always' },
    { gate: 'secrets', why: 'always' },
  ]);
  assert.deepEqual(f, [{ kind: 'gates', message: "gate 'lint' applies (always) but no step covers it and gates.skip doesn't list it" }]);
});

test('coverageFindings: a skipped gate is not a gap', () => {
  const f = coverageFindings({ validate: [], gates: { skip: { lint: 'r' } } }, [{ gate: 'lint', why: 'always' }]);
  assert.deepEqual(f, []);
});

test('coverageFindings: a step with no gate is reported', () => {
  const f = coverageFindings({ validate: [{ name: 'ci', run: 'make ci' }], gates: { skip: {} } }, []);
  assert.deepEqual(f, [{ kind: 'gates', message: "step 'ci' covers no gate" }]);
});

test('coverageFindings: covering a non-applicable gate is fine', () => {
  assert.deepEqual(coverageFindings({ validate: [{ name: 'b', run: 'x', gates: ['budget'] }], gates: { skip: {} } }, []), []);
});

test('orderFindings: secrets after tests is reported', () => {
  const steps = [
    normalizeStep({ name: 'test', run: 'x', gates: ['unit-tests', 'build'] }),
    normalizeStep({ name: 'sec', run: 'y', gates: ['secrets', 'lint'] }),
  ];
  assert.deepEqual(orderFindings(steps), [{ kind: 'gates', message: "step 'sec' runs secrets, lint after 'test' (unit-tests, build)" }]);
});

test('orderFindings: static before non-static is fine', () => {
  const steps = [normalizeStep({ name: 'sec', run: 'y', gates: ['secrets'] }), normalizeStep({ name: 'test', run: 'x', gates: ['unit-tests'] })];
  assert.deepEqual(orderFindings(steps), []);
});

test('orderFindings: non-static after non-static is fine', () => {
  const steps = [normalizeStep({ name: 'a', run: 'x', gates: ['unit-tests'] }), normalizeStep({ name: 'b', run: 'y', gates: ['build'] })];
  assert.deepEqual(orderFindings(steps), []);
});

test('orderFindings: mixed gates report only the offending sides', () => {
  const steps = [normalizeStep({ name: 'a', run: 'x', gates: ['lint', 'unit-tests'] }), normalizeStep({ name: 'b', run: 'y', gates: ['secrets', 'e2e'] })];
  assert.deepEqual(orderFindings(steps), [{ kind: 'gates', message: "step 'b' runs secrets after 'a' (unit-tests)" }]);
});
