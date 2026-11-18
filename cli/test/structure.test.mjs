import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkStructure, countLines, formatFindings, matchGlob, SOURCE_EXTENSIONS } from '../lib/structure.mjs';

const SPLIT = 'Split it in this PR (stacks/common.md, Size and structure).';

const run = ({ files = [], skippedForExtension = 0, maxLines = 10, exclude = [], allowlist = {} } = {}) =>
  checkStructure({ files, skippedForExtension, config: { maxLines, exclude, allowlist } });

const states = (result) => result.files.map((f) => `${f.path}:${f.state}`);

test('SOURCE_EXTENSIONS lists the guided stacks', () => {
  assert.deepEqual([...SOURCE_EXTENSIONS], ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.rs']);
  assert.ok(Object.isFrozen(SOURCE_EXTENSIONS));
});

test('countLines counts a final line without a newline and ignores CR', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines(Buffer.alloc(0)), 0);
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines(Buffer.from('a\nb')), 2);
  assert.equal(countLines('a\r\nb\r\n'), 2);
  assert.equal(countLines(Buffer.from('a\r\nb\r\nc')), 3);
  assert.equal(countLines('\n'), 1);
  assert.equal(countLines('x'), 1);
});

test('matchGlob ** matches zero or more segments and * stops at a slash', () => {
  const cases = [
    ['src/*.js', 'src/a.js', true],
    ['src/*.js', 'src/a/b.js', false],
    ['*.js', 'a.js', true],
    ['*.js', 'src/a.js', false],
    ['src/?.js', 'src/a.js', true],
    ['src/?.js', 'src/ab.js', false],
    ['src?a.js', 'src/a.js', false],
    ['**/gen.ts', 'gen.ts', true],
    ['**/gen.ts', 'a/b/gen.ts', true],
    ['src/**/gen.ts', 'src/gen.ts', true],
    ['src/**/gen.ts', 'src/a/b/gen.ts', true],
    ['src/**/gen.ts', 'lib/src/gen.ts', false],
    ['vendor/**', 'vendor/a.js', true],
    ['vendor/**', 'vendor/a/b/c.js', true],
    ['vendor/**', 'vendored/a.js', false],
    ['a.b/*.js', 'axb/c.js', false],
    ['a+b/(x).js', 'a+b/(x).js', true],
    ['src/a.js', 'src/a.js', true],
    ['src/a.js', 'src/a.jsx', false],
  ];
  for (const [pattern, path, expected] of cases) {
    assert.equal(matchGlob(pattern, path), expected, `${pattern} vs ${path}`);
  }
});

test('checkStructure reports a listed file under the limit before comparing counts', () => {
  // 8 lines against an entry of 9 would be "shrank" if counts were compared first.
  const result = run({ files: [{ path: 'a.js', lines: 8 }], allowlist: { 'a.js': 9 } });
  assert.deepEqual(result.files, [{ path: 'a.js', lines: 8, allowlisted: 9, state: 'under-limit' }]);
  assert.equal(result.ok, false);
  assert.deepEqual(formatFindings(result).lines, ['✖ a.js: 8 lines, under the 10-line limit. Remove its structure.allowlist entry.']);
  // At exactly the limit is under it too.
  assert.equal(run({ files: [{ path: 'a.js', lines: 10 }], allowlist: { 'a.js': 12 } }).files[0].state, 'under-limit');
});

test('checkStructure reports grew and held', () => {
  const result = run({
    files: [
      { path: 'grew.js', lines: 15 },
      { path: 'held.js', lines: 12 },
    ],
    allowlist: { 'grew.js': 12, 'held.js': 12 },
  });
  assert.deepEqual(result.files, [
    { path: 'grew.js', lines: 15, allowlisted: 12, state: 'grew' },
    { path: 'held.js', lines: 12, allowlisted: 12, state: 'held' },
  ]);
  assert.deepEqual(formatFindings(result).lines, [
    '✖ grew.js: 15 lines, allowlisted at 12. It grew: split it in this PR (stacks/common.md, Size and structure).',
  ]);
  assert.equal(result.ok, false);
  assert.equal(run({ files: [{ path: 'held.js', lines: 12 }], allowlist: { 'held.js': 12 } }).ok, true);
});

test('checkStructure reports shrank with the exact set-to edit', () => {
  const result = run({ files: [{ path: 'src/my file.rs', lines: 11 }], allowlist: { 'src/my file.rs': 14 } });
  assert.deepEqual(result.files, [{ path: 'src/my file.rs', lines: 11, allowlisted: 14, state: 'shrank' }]);
  assert.deepEqual(formatFindings(result).lines, [
    '✖ src/my file.rs: 11 lines, allowlisted at 14. It shrank: set structure.allowlist["src/my file.rs"] to 11.',
  ]);
});

test('checkStructure reports an unlisted file over the limit', () => {
  const result = run({ files: [{ path: 'big.ts', lines: 11 }] });
  assert.deepEqual(result.files, [{ path: 'big.ts', lines: 11, allowlisted: null, state: 'unlisted' }]);
  assert.equal(result.ok, false);
  assert.deepEqual(formatFindings(result).lines, [`✖ big.ts: 11 lines, over the 10-line limit. ${SPLIT}`]);
});

test('checkStructure passes a file at exactly the limit', () => {
  const result = run({
    files: [
      { path: 'at.js', lines: 10 },
      { path: 'under.js', lines: 3 },
    ],
  });
  assert.deepEqual(result, { ok: true, maxLines: 10, checked: 2, notCounted: 0, files: [] });
  assert.deepEqual(formatFindings(result).lines, []);
});

test('checkStructure reports an excluded allowlist path as not counted', () => {
  const result = run({
    files: [
      { path: 'gen/big.js', lines: 40 },
      { path: 'small.js', lines: 2 },
    ],
    exclude: ['gen/**'],
    allowlist: { 'gen/big.js': 40 },
  });
  // Not counted wins over every count comparison, and an excluded file isn't checked.
  assert.deepEqual(result.files, [{ path: 'gen/big.js', lines: null, allowlisted: 40, state: 'not-counted', why: 'excluded' }]);
  assert.equal(result.checked, 1);
  assert.deepEqual(formatFindings(result).lines, ['✖ gen/big.js: on structure.allowlist but not counted (excluded). Remove its entry.']);
});

test('checkStructure gives each not-counted reason', () => {
  const result = run({
    files: [
      { path: 'link.js', lines: null, why: 'not a regular file' },
      { path: 'notes.md', lines: 30 },
    ],
    allowlist: { 'gone.js': 20, 'link.js': 20, 'notes.md': 30 },
  });
  assert.deepEqual(states(result), ['gone.js:not-counted', 'link.js:not-counted', 'notes.md:not-counted']);
  assert.deepEqual(formatFindings(result).lines, [
    '✖ gone.js: on structure.allowlist but not counted (missing). Remove its entry.',
    '✖ link.js: on structure.allowlist but not counted (not a regular file). Remove its entry.',
    '✖ notes.md: on structure.allowlist but not counted (no source extension). Remove its entry.',
  ]);
  assert.equal(result.checked, 0);
});

test('checkStructure ignores excluded and non-source files over the limit', () => {
  const result = run({
    files: [
      { path: 'vendor/x.js', lines: 99 },
      { path: 'README.md', lines: 99 },
    ],
    exclude: ['vendor/**'],
  });
  assert.deepEqual(result, { ok: true, maxLines: 10, checked: 0, notCounted: 0, files: [] });
});

test('checkStructure sorts findings by path', () => {
  const result = run({
    files: [
      { path: 'z.js', lines: 20 },
      { path: 'B.js', lines: 20 },
      { path: 'a/b.js', lines: 20 },
      { path: 'm.js', lines: 12 },
    ],
    allowlist: { 'm.js': 13, 'c.js': 20 },
  });
  assert.deepEqual(states(result), ['B.js:unlisted', 'a/b.js:unlisted', 'c.js:not-counted', 'm.js:shrank', 'z.js:unlisted']);
  assert.deepEqual(
    formatFindings(result).lines.map((l) => l.split(':')[0]),
    ['✖ B.js', '✖ a/b.js', '✖ c.js', '✖ m.js', '✖ z.js'],
  );
});

test('formatFindings summary counts files, entries and failures', () => {
  const clean = run({ files: [{ path: 'a.js', lines: 12 }], allowlist: { 'a.js': 12 } });
  assert.equal(formatFindings(clean).summary, 'structure: 1 files checked, limit 10, 1 allowlisted, no failures');
  const failing = run({
    files: [
      { path: 'a.js', lines: 12 },
      { path: 'b.js', lines: 3 },
    ],
    allowlist: { 'a.js': 11, 'gone.js': 50 },
  });
  assert.equal(formatFindings(failing).summary, 'structure: 2 files checked, limit 10, 2 allowlisted, 2 failures');
});

test('formatFindings adds the not-counted suffix only when files were skipped for their extension', () => {
  const skipped = run({ files: [{ path: 'a.js', lines: 1 }], skippedForExtension: 3 });
  assert.equal(skipped.notCounted, 3);
  assert.equal(
    formatFindings(skipped).summary,
    'structure: 1 files checked, limit 10, 0 allowlisted, no failures, 3 files not counted (no guide for their extension)',
  );
  assert.equal(formatFindings(run({ files: [{ path: 'a.js', lines: 1 }] })).summary, 'structure: 1 files checked, limit 10, 0 allowlisted, no failures');
});

test('formatFindings paste block records every unlisted file and nothing else', () => {
  const result = run({
    files: [
      { path: 'src/tray.rs', lines: 612 },
      { path: 'src/app.rs', lines: 700 },
      { path: 'src/held.rs', lines: 40 },
    ],
    allowlist: { 'src/held.rs': 41 },
  });
  assert.deepEqual(formatFindings(result).pasteBlock, [
    "To record these instead of splitting them (needs the owner's approval), add to structure.allowlist:",
    '  "src/app.rs": 700,',
    '  "src/tray.rs": 612',
  ]);
  assert.deepEqual(formatFindings(run({ files: [{ path: 'a.js', lines: 12 }], allowlist: { 'a.js': 13 } })).pasteBlock, []);
});
