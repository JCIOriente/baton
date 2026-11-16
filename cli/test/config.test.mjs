import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.deepEqual(problems(step({ blocking: false, reason: 'flaky' })), []);
});

test('config rejects duplicate step names', () => {
  const p = problems({ validate: [{ name: 'a', run: 'x' }, { name: 'a', run: 'y' }] });
  assert.match(p.join(), /validate\[1\] 'a'.*duplicate step name/);
});

test('config rejects a skip key outside the catalog', () => {
  assert.match(problems({ gates: { skip: { nope: 'why' } } }).join(), /gates\.skip.*'nope'/);
});

test('config rejects an empty skip reason', () => {
  assert.match(problems({ gates: { skip: { lint: '' } } }).join(), /gates\.skip\.lint/);
});

test('config rejects a skip reason with a newline', () => {
  assert.match(problems({ gates: { skip: { lint: 'a\nb' } } }).join(), /gates\.skip\.lint.*newline/);
});

test('config rejects a gate that is both skipped and covered', () => {
  const p = problems({ ...step({ gates: ['lint'] }), gates: { skip: { lint: 'not needed' } } });
  assert.match(p.join(), /validate\[0\] 'a'.*'lint'.*skipped/);
});

test('config accepts a config written before gates existed', () => {
  const batonConfig = JSON.parse(readFileSync(new URL('../../.baton/config.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateConfig(deepMerge(DEFAULT_CONFIG, batonConfig)), []);
  assert.deepEqual(problems({ validate: [{ run: 'x' }] }), []);
});

test('config does not check setup steps against the gate rules', () => {
  assert.deepEqual(problems({ setup: [{ name: 'i', run: 'x', gates: ['nope'], blocking: 'z' }] }), []);
});
