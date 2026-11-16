import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_STAGES, GATES, STAGES, STATIC_GATES, applicableGates, coverageFindings, normalizeStep, orderFindings } from '../lib/gates.mjs';
import { hasDependencies } from '../lib/detect.mjs';

const repo = (files = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'gates-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};
const names = (root, config = {}) => applicableGates({ root, config: { stacks: [], release: { publish: [] }, ...config } }).map((g) => g.gate);
const BASE = ['secrets', 'format', 'lint', 'unit-tests'];

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

test('hasDependencies', () => {
  assert.equal(hasDependencies(repo()), false);
  assert.equal(hasDependencies(repo({ 'package.json': '{}' })), false);
  assert.equal(hasDependencies(repo({ 'package.json': '{"dependencies":{"a":"1"}}' })), true);
});

test('applicableGates: always gates only in an empty repo', () => {
  assert.deepEqual(names(repo()), BASE);
});

test('applicableGates: package.json with only devDependencies adds install, audit, unused-deps', () => {
  const root = repo({ 'package.json': '{"devDependencies":{"a":"1"}}' });
  assert.deepEqual(names(root), ['secrets', 'install', 'format', 'lint', 'unused-deps', 'audit', 'unit-tests']);
});

test('applicableGates: package.json without dependencies adds nothing', () => {
  assert.deepEqual(names(repo({ 'package.json': '{"name":"x"}' })), BASE);
});

test('applicableGates: Cargo.toml one level down adds install, audit, unused-deps', () => {
  const root = repo({ 'crates/a/Cargo.toml': '[package]\n' });
  assert.deepEqual(names(root), ['secrets', 'install', 'format', 'lint', 'unused-deps', 'audit', 'unit-tests']);
});

test('applicableGates: stack rows', () => {
  for (const s of ['typescript', 'rust', 'rust-tokio-postgres']) assert.ok(names(repo(), { stacks: [s] }).includes('types'), s);
  assert.ok(names(repo(), { stacks: ['postgres'] }).includes('migrations'));
  assert.ok(names(repo(), { stacks: ['e2e'] }).includes('e2e'));
  assert.ok(names(repo(), { stacks: ['react'] }).includes('build'));
  assert.ok(!names(repo(), { stacks: ['javascript', 'node'] }).some((g) => ['types', 'migrations', 'e2e', 'build'].includes(g)));
});

test('applicableGates: release.publish non-empty adds publish', () => {
  const r = applicableGates({ root: repo(), config: { stacks: [], release: { publish: ['npm'] } } });
  assert.deepEqual(r.map((g) => g.gate), [...BASE, 'publish']);
  assert.ok(r.every((g) => g.why));
});

test('applicableGates: never-applicable gates are never returned', () => {
  const all = names(repo({ 'package.json': '{"dependencies":{"a":"1"}}' }), { stacks: ['typescript', 'react', 'postgres', 'e2e'], release: { publish: ['npm'] } });
  for (const g of ['structure', 'generated', 'dead-code', 'integration-tests', 'budget']) assert.ok(!all.includes(g), g);
});

test('coverageFindings: an uncovered gate is reported', () => {
  const f = coverageFindings({ validate: [{ name: 's', run: 'x', gates: ['secrets'] }], gates: { skip: {} } }, [{ gate: 'lint', why: 'always' }, { gate: 'secrets', why: 'always' }]);
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
  const steps = [normalizeStep({ name: 'test', run: 'x', gates: ['unit-tests', 'build'] }), normalizeStep({ name: 'sec', run: 'y', gates: ['secrets', 'lint'] })];
  assert.deepEqual(orderFindings(steps), [
    { kind: 'gates', message: "step 'sec' runs secrets, lint after 'test' (unit-tests, build)" },
  ]);
});

test('orderFindings: static before non-static is fine', () => {
  const steps = [normalizeStep({ name: 'sec', run: 'y', gates: ['secrets'] }), normalizeStep({ name: 'test', run: 'x', gates: ['unit-tests'] })];
  assert.deepEqual(orderFindings(steps), []);
});
