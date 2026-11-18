import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_CONFIG, validateConfig } from '../lib/config.mjs';
import { deepMerge } from '../lib/util.mjs';

const cfg = (over) => deepMerge(DEFAULT_CONFIG, over);
const problems = (over) => validateConfig(cfg(over));
const step = (extra) => ({ validate: [{ name: 'a', run: 'x', ...extra }] });

test('config rejects an unknown gate name with the step index and name', () => {
  const p = problems(step({ gates: ['nope'] }));
  assert.equal(p.length, 1);
  assert.match(p[0], /validate\[0\] 'a'.*unknown gate 'nope'/);
});

test('config rejects an unknown stage', () => {
  assert.match(problems(step({ stages: ['prod'] })).join(), /validate\[0\] 'a'.*unknown stage 'prod'/);
});

test('config rejects empty gates and stages', () => {
  assert.match(problems(step({ gates: [] })).join(), /validate\[0\] 'a'.*gates must be non-empty/);
  assert.match(problems(step({ stages: [] })).join(), /validate\[0\] 'a'.*stages must be non-empty/);
});

test('config rejects duplicate gates and stages within a step', () => {
  assert.match(problems(step({ gates: ['lint', 'lint'] })).join(), /validate\[0\] 'a'.*duplicate gate 'lint'/);
  assert.match(problems(step({ stages: ['ci', 'ci'] })).join(), /validate\[0\] 'a'.*duplicate stage 'ci'/);
});

test('config rejects a non-boolean blocking', () => {
  assert.match(problems(step({ blocking: 'no' })).join(), /validate\[0\] 'a'.*blocking must be a boolean/);
});

test('config rejects an advisory step without a reason', () => {
  assert.match(problems(step({ blocking: false })).join(), /validate\[0\] 'a'.*reason/);
  assert.match(problems(step({ blocking: false, reason: '' })).join(), /validate\[0\] 'a'.*reason/);
  assert.match(problems(step({ blocking: false, reason: '   ' })).join(), /validate\[0\] 'a'.*reason/);
  assert.deepEqual(problems(step({ blocking: false, reason: 'flaky' })), []);
});

test('config rejects duplicate step names', () => {
  const p = problems({
    validate: [
      { name: 'a', run: 'x' },
      { name: 'a', run: 'y' },
    ],
  });
  assert.match(p.join(), /validate\[1\] 'a'.*duplicate step name/);
  assert.deepEqual(problems({ validate: [{ run: 'x' }, { run: 'x' }] }), []);
  assert.deepEqual(
    problems({
      validate: [
        { run: 'npm test', cwd: 'apps/a' },
        { run: 'npm test', cwd: 'apps/b' },
      ],
    }),
    [],
  );
  assert.deepEqual(problems({ validate: [{ name: 'x', run: 'y' }, { run: 'x' }] }), []);
  assert.deepEqual(problems({ validate: [{ run: 'x' }, { run: 'y' }] }), []);
});

test('config rejects a skip key outside the catalog', () => {
  assert.match(problems({ gates: { skip: { nope: 'why' } } }).join(), /gates\.skip.*'nope'/);
});

test('config rejects an empty skip reason', () => {
  assert.match(problems({ gates: { skip: { lint: '' } } }).join(), /gates\.skip\.lint/);
  assert.match(problems({ gates: { skip: { lint: ' ' } } }).join(), /gates\.skip\.lint/);
});

test('config rejects a skip reason with a newline', () => {
  assert.match(problems({ gates: { skip: { lint: 'a\nb' } } }).join(), /gates\.skip\.lint.*newline/);
});

test('config rejects a gate that is both skipped and covered', () => {
  const p = problems({ ...step({ gates: ['lint'] }), gates: { skip: { lint: 'not needed' } } });
  assert.match(p.join(), /validate\[0\] 'a'.*'lint'.*skipped/);
});

test('config accepts a config written before gates existed', () => {
  const legacy = { project: 'baton', stacks: ['javascript', 'node'], validate: [{ name: 'ci', run: 'make ci' }], release: { enabled: true, publish: [] } };
  assert.deepEqual(validateConfig(deepMerge(DEFAULT_CONFIG, legacy)), []);
  assert.deepEqual(problems({ validate: [{ run: 'x' }] }), []);
});

test('config rejects a non-object gates.skip and a non-array gates, and keeps checking steps', () => {
  assert.match(problems({ gates: { skip: [] } }).join(), /gates\.skip must be an object/);
  assert.match(problems(step({ gates: 'lint' })).join(), /validate\[0\] 'a'.*gates must be an array/);
  const p = problems({ gates: { skip: [] }, validate: [{ run: 'x', gates: ['nope'] }] });
  assert.equal(p.length, 2);
  assert.match(p.join(), /gates\.skip must be an object/);
  assert.match(p.join(), /unknown gate 'nope'/);
});

test('config does not check setup steps against the gate rules', () => {
  assert.deepEqual(problems({ setup: [{ name: 'i', run: 'x', gates: ['nope'], blocking: 'z' }] }), []);
});

test('config has no worktreeRoot, and a config that still sets it is valid', () => {
  assert.equal(Object.hasOwn(DEFAULT_CONFIG.git, 'worktreeRoot'), false);
  assert.deepEqual(problems({ git: { worktreeRoot: '../{repo}-worktrees' } }), []);
  const example = JSON.parse(readFileSync(new URL('../../templates/config.example.json', import.meta.url), 'utf8'));
  assert.equal(Object.hasOwn(example.git, 'worktreeRoot'), false);
});

const structure = (over) => problems({ structure: over });

test('config defaults structure to a 500-line limit with no exclusions or allowlist', () => {
  assert.deepEqual(DEFAULT_CONFIG.structure, { maxLines: 500, exclude: [], allowlist: {} });
  assert.deepEqual(problems({}), []);
});

test('config rejects a maxLines that is not an integer of at least 1', () => {
  for (const bad of [0, -1, 1.5, '500', null]) {
    const p = structure({ maxLines: bad });
    assert.equal(p.length, 1, `maxLines ${JSON.stringify(bad)}: ${p}`);
    assert.match(p[0], /^structure\.maxLines: /);
  }
  assert.deepEqual(structure({ maxLines: 1 }), []);
});

test('config rejects an exclude that is not an array of non-empty strings', () => {
  for (const bad of ['dist/**', [''], [3], {}]) {
    const p = structure({ exclude: bad });
    assert.equal(p.length, 1, `exclude ${JSON.stringify(bad)}: ${p}`);
    assert.match(p[0], /^structure\.exclude: /);
  }
  assert.deepEqual(structure({ exclude: ['dist/**', 'gen/*.ts'] }), []);
});

test('config rejects an allowlist that is not an object', () => {
  for (const bad of [[], 'a.js', 3]) {
    const p = structure({ allowlist: bad });
    assert.equal(p.length, 1, `allowlist ${JSON.stringify(bad)}: ${p}`);
    assert.match(p[0], /^structure\.allowlist: /);
  }
});

test('config rejects an allowlist key that is empty or starts with ./ or /', () => {
  for (const key of ['', './a.js', '/a.js']) {
    const p = structure({ allowlist: { [key]: 600 } });
    assert.equal(p.length, 1, `key ${JSON.stringify(key)}: ${p}`);
    assert.match(p[0], /^structure\.allowlist: /);
    assert.ok(p[0].includes(JSON.stringify(key)), p[0]);
  }
});

test('config rejects an allowlist value that is not an integer of at least 1', () => {
  for (const bad of [0, -3, 600.5, '600', null]) {
    const p = structure({ allowlist: { 'src/a.js': bad } });
    assert.equal(p.length, 1, `value ${JSON.stringify(bad)}: ${p}`);
    assert.match(p[0], /^structure\.allowlist: "src\/a\.js" /);
  }
});

test('config accepts an allowlist value at or under maxLines', () => {
  assert.deepEqual(structure({ maxLines: 500, allowlist: { 'a.js': 500, 'b.js': 1, 'c d/é.rs': 900 } }), []);
});

test('config rejects an unknown key under structure', () => {
  const p = structure({ maxline: 400 });
  assert.equal(p.length, 1, String(p));
  assert.match(p[0], /^structure\.maxline: unknown key/);
});

test('config rejects a structure that is not an object', () => {
  assert.deepEqual(problems({ structure: [] }), ['structure: must be an object']);
});
