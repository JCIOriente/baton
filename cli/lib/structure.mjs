// @ts-check
// Pure core of `baton structure`: line counting, glob matching and classification against
// the size limit and allowlist (docs/specs/2026-11-17-structure-guards.md). No I/O here.

/** Extensions of the stacks baton has guides for. Adding one is a baton change. */
export const SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.rs']);

const NEWLINE = 0x0a;
const NO_REASON = 'no reason given';
const SPLIT = 'Split it in this PR (stacks/common.md, Size and structure).';

/**
 * Number of `\n` characters, plus one when the input is non-empty and doesn't end with `\n`.
 * @param {Buffer | string} buf
 * @returns {number}
 */
export function countLines(buf) {
  const bytes = typeof buf === 'string' ? Buffer.from(buf) : buf;
  if (bytes.length === 0) return 0;
  let lines = 0;
  for (let i = bytes.indexOf(NEWLINE); i !== -1; i = bytes.indexOf(NEWLINE, i + 1)) lines++;
  if (bytes[bytes.length - 1] !== NEWLINE) lines++;
  return lines;
}

/** @param {string} pattern @returns {RegExp} */
function globToRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      const segmentStart = i === 0 || pattern[i - 1] === '/';
      i++;
      if (segmentStart && pattern[i + 1] === '/') {
        out += '(?:[^/]*/)*'; // `**/`: zero or more whole segments
        i++;
      } else {
        out += '.*';
      }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
  }
  // `s` lets `.` match a newline and `u` makes `?` one code point, as `[^/]` already does.
  return new RegExp(`^${out}$`, 'su');
}

/**
 * Matches a repo-relative POSIX path against a glob: `*` and `?` stay within one segment,
 * `**` matches any number of segments.
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export function matchGlob(pattern, path) {
  return globToRegex(pattern).test(path);
}

/** @param {string} path */
const hasSourceExtension = (path) => SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));

/** Code-unit order, so the output doesn't depend on the locale. @param {{ path: string }} a @param {{ path: string }} b */
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * A counted file has `lines`. A path the runner couldn't count has `lines: null` and `why`.
 * @typedef {{ path: string, lines: number, why?: undefined } | { path: string, lines: null, why: string }} FileInput
 * @typedef {'unlisted' | 'not-counted' | 'under-limit' | 'grew' | 'shrank' | 'held'} State
 * @typedef {{ path: string, lines: number | null, allowlisted: number | null, state: State, why?: string }} FileResult
 * @typedef {{ ok: boolean, maxLines: number, checked: number, notCounted: number, files: FileResult[] }} StructureResult
 */

/**
 * Why a path isn't counted, or null when it is. `entry` is the runner's record for the path,
 * if it listed one; a record with `lines: null` carries the runner's reason.
 * @param {string} path
 * @param {FileInput | undefined} entry
 * @param {string[]} exclude
 * @returns {string | null}
 */
function notCountedReason(path, entry, exclude) {
  if (entry && entry.lines === null) return entry.why || NO_REASON;
  if (exclude.some((glob) => matchGlob(glob, path))) return 'excluded';
  if (!hasSourceExtension(path)) return 'no source extension';
  if (!entry) return 'missing';
  return null;
}

/**
 * The state of one allowlist entry, checking the spec's table in order (the first match wins).
 * @param {string} path
 * @param {number} allowlisted
 * @param {FileInput | undefined} entry
 * @param {{ maxLines: number, exclude: string[] }} config
 * @returns {FileResult}
 */
function classifyEntry(path, allowlisted, entry, { maxLines, exclude }) {
  const why = notCountedReason(path, entry, exclude);
  if (why !== null || !entry || entry.lines === null) {
    return { path, lines: null, allowlisted, state: 'not-counted', why: why ?? NO_REASON };
  }
  const { lines } = entry;
  if (lines <= maxLines) return { path, lines, allowlisted, state: 'under-limit' };
  if (lines > allowlisted) return { path, lines, allowlisted, state: 'grew' };
  if (lines < allowlisted) return { path, lines, allowlisted, state: 'shrank' };
  return { path, lines, allowlisted, state: 'held' };
}

/**
 * Classifies every counted file over the limit and every allowlist entry. Pure: the runner
 * lists and reads the files. A `not-counted` result also carries `why`, for its finding.
 * @param {{ files: FileInput[], skippedForExtension: number, config: { maxLines: number, exclude: string[], allowlist: Record<string, number> } }} input
 * @returns {StructureResult}
 */
export function checkStructure({ files, skippedForExtension, config }) {
  const { maxLines, exclude, allowlist } = config;
  /** @type {FileResult[]} */
  const results = [];
  let checked = 0;
  for (const file of files) {
    if (file.lines === null || notCountedReason(file.path, file, exclude) !== null) continue;
    checked++;
    if (file.lines > maxLines && !Object.hasOwn(allowlist, file.path)) {
      results.push({ path: file.path, lines: file.lines, allowlisted: null, state: 'unlisted' });
    }
  }
  const byName = new Map(files.map((f) => [f.path, f]));
  for (const [path, allowlisted] of Object.entries(allowlist)) {
    results.push(classifyEntry(path, allowlisted, byName.get(path), config));
  }
  results.sort(byPath);
  return {
    ok: results.every((r) => r.state === 'held'),
    maxLines,
    checked,
    notCounted: skippedForExtension,
    files: results,
  };
}

/**
 * The finding text for one file, or null for a held entry.
 * @param {FileResult} f
 * @param {number} max
 * @returns {string | null}
 */
function finding(f, max) {
  switch (f.state) {
    case 'unlisted':
      return `${f.lines} lines, over the ${max}-line limit. ${SPLIT}`;
    case 'not-counted':
      return `on structure.allowlist but not counted (${f.why ?? NO_REASON}). Remove its entry.`;
    case 'under-limit':
      return `${f.lines} lines, under the ${max}-line limit. Remove its structure.allowlist entry.`;
    case 'grew':
      return `${f.lines} lines, allowlisted at ${f.allowlisted}. It grew: split it in this PR (stacks/common.md, Size and structure).`;
    case 'shrank':
      return `${f.lines} lines, allowlisted at ${f.allowlisted}. It shrank: set structure.allowlist[${JSON.stringify(f.path)}] to ${f.lines}.`;
    case 'held':
      return null;
    default:
      throw new Error(`unknown structure state: ${f.state}`);
  }
}

/**
 * Text output of a run: one `✖` line per finding (in the result's path order), the summary,
 * and the `--suggest-allowlist` block (empty when no file is unlisted).
 * @param {StructureResult} result
 * @returns {{ lines: string[], summary: string, pasteBlock: string[] }}
 */
export function formatFindings(result) {
  /** @type {string[]} */
  const lines = [];
  for (const f of result.files) {
    const text = finding(f, result.maxLines);
    if (text !== null) lines.push(`✖ ${f.path}: ${text}`);
  }
  // Every allowlist entry is in `files` exactly once, and only entries have a non-null `allowlisted`.
  const entries = result.files.filter((f) => f.allowlisted !== null).length;
  const failures = lines.length === 0 ? 'no failures' : `${lines.length} failures`;
  let summary = `structure: ${result.checked} files checked, limit ${result.maxLines}, ${entries} allowlisted, ${failures}`;
  if (result.notCounted > 0) summary += `, ${result.notCounted} files not counted (no guide for their extension)`;
  const unlisted = result.files.filter((f) => f.state === 'unlisted');
  const pasteBlock =
    unlisted.length === 0
      ? []
      : [
          "To record these instead of splitting them (needs the owner's approval), add to structure.allowlist:",
          ...unlisted.map((f, i) => `  ${JSON.stringify(f.path)}: ${f.lines}${i < unlisted.length - 1 ? ',' : ''}`),
        ];
  return { lines, summary, pasteBlock };
}
