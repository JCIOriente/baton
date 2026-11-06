// Provider-independent task logic. Pure functions only, so they are easy to test.

const DEP_LINE = /^\s*(?:[-*]\s*)?(?:depends on|blocked by|dependencies)\s*:\s*(.+)$/im;

/** Parse `Depends on: #12, #14` (or `Blocked by:`) lines from an issue body. Same-repo refs only. */
export function parseDependencies(body = '') {
  const deps = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(DEP_LINE);
    if (!m) continue;
    for (const ref of m[1].matchAll(/(?<![\w/])#(\d+)/g)) deps.add(Number(ref[1]));
  }
  return [...deps].sort((a, b) => a - b);
}

/** `priority:p0` -> 0. Unprioritized tasks sort last. */
export function priorityOf(labels, prefix) {
  for (const l of labels) {
    const name = typeof l === 'string' ? l : l.name;
    if (name.startsWith(prefix)) {
      const m = name.slice(prefix.length).match(/^p?(\d+)$/i);
      if (m) return Number(m[1]);
    }
  }
  return 99;
}

export function labelNames(labels = []) {
  return labels.map((l) => (typeof l === 'string' ? l : l.name));
}

/** Derive a single status from labels/assignees/state. */
export function statusOf(task, labels) {
  if (task.state && task.state.toLowerCase() === 'closed') return 'done';
  const names = labelNames(task.labels);
  if (names.includes(labels.review)) return 'review';
  if (names.includes(labels.inProgress)) return 'in-progress';
  if (names.includes(labels.blocked)) return 'blocked';
  if (names.includes(labels.ready)) return 'ready';
  return 'triage';
}

/**
 * Choose the next claimable tasks: ready, unassigned, all dependencies closed.
 * `openNumbers` is the set of currently open issue numbers in the repo.
 */
export function rankClaimable(tasks, labels, openNumbers) {
  return tasks
    .filter((t) => statusOf(t, labels) === 'ready')
    .filter((t) => (t.assignees ?? []).length === 0)
    .map((t) => ({ ...t, deps: parseDependencies(t.body), priority: priorityOf(t.labels, labels.priorityPrefix) }))
    .filter((t) => t.deps.every((d) => !openNumbers.has(d)))
    .sort((a, b) => a.priority - b.priority || a.number - b.number);
}

/**
 * Blocked tasks that can go back to ready: they declare dependencies and all of them are closed.
 * Tasks blocked for other reasons (no declared dependencies) are left alone.
 */
export function unblockable(blockedTasks, openNumbers) {
  return blockedTasks.filter((t) => {
    const deps = parseDependencies(t.body);
    return deps.length > 0 && deps.every((d) => !openNumbers.has(d));
  });
}

/** PR body: the closing reference, the author's paragraphs, then the validation that actually ran. */
export function prBody(number, extra, results) {
  const validation = results.map((r) => `${r.name} (\`${r.run}\`)`).join(', ') || '(no validation configured)';
  const middle = extra?.trim() ? `${extra.trim()}\n\n` : '';
  return `Closes #${number}\n\n${middle}Validated: ${validation}\n`;
}

/**
 * Review gate for `baton done`: the PR body must record a review of exactly `head`
 * (`Reviewed-at: <sha>`, 7+ hex chars). Any commit after the review makes it stale.
 */
export function reviewState(body, head) {
  const m = (body ?? '').match(/^Reviewed-at:\s*([0-9a-f]{7,40})\s*$/im);
  if (!m) return { ok: false, reason: 'no `Reviewed-at: <sha>` line in the PR body' };
  if (!head.startsWith(m[1].toLowerCase())) return { ok: false, reason: `review recorded at ${m[1]}, but HEAD is ${head.slice(0, 12)}: commits were added after the review` };
  return { ok: true };
}

// --- Releases ----------------------------------------------------------------

// Written by release-please at release time (only the root one, for the package at `.`).
export const CHANGELOG_FILE = 'CHANGELOG.md';
// The files baton:init writes when a repo enables releases.
export const RELEASE_FILES = ['release-please-config.json', '.release-please-manifest.json', '.github/workflows/release.yml'];
const RELEASE_WORKFLOW = '.github/workflows/release.yml';

/**
 * Whether a raw `.baton/config.json` text (the base branch's copy) enables releases.
 * Missing, empty or invalid JSON means off: the guard must never block a repo that didn't opt in.
 */
export function releaseEnabledIn(configText) {
  try {
    return JSON.parse(configText)?.release?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * CHANGELOG gate for `baton done`: with releases enabled on the base branch, the changelog is
 * generated at release, so a task PR must not touch it.
 */
export function changelogGuard({ files, releaseEnabled }) {
  if (releaseEnabled && files.includes(CHANGELOG_FILE)) {
    return { ok: false, reason: 'CHANGELOG.md is generated at release. Revert it; the PR title is the changelog entry.' };
  }
  return { ok: true };
}

const OVERRIDE_BEGIN = 'BEGIN_COMMIT_OVERRIDE';
const OVERRIDE_END = 'END_COMMIT_OVERRIDE';
const CONVENTIONAL_HEADER = /^(feat|fix|perf|revert|docs|chore|refactor|test|build|ci|style|deps)(\([^()]+\))?!?: \S/;
const OVERRIDE_FOOTER = /^(Release-As: \d+\.\d+\.\d+$|BREAKING CHANGE: \S)/;

/**
 * Commit override check for `baton done`. release-please takes everything after the first BEGIN
 * marker of a merged PR body, up to the next END marker or the end of the body, as the commit
 * message, so a mention in prose turns sentence fragments into the changelog entry. Accepts only
 * one block whose marker lines stand alone and whose other lines are Conventional Commit headers
 * or Release-As / BREAKING CHANGE footers. Returns one message per problem; none means safe.
 */
export function overrideFindings(body = '') {
  const findings = [];
  let state = 'before'; // before -> inside -> after the one block release-please reads
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === OVERRIDE_BEGIN) {
      if (state === 'before') state = 'inside';
      else if (state === 'after') findings.push('a second commit override block is ignored by release-please: put every entry in the first block.');
      else findings.push(`the commit override block opens again before its ${OVERRIDE_END} line.`);
    } else if (line === OVERRIDE_END) {
      if (state === 'inside') state = 'after';
      else findings.push(`a ${OVERRIDE_END} line has no block to close.`);
    } else if (line.includes(OVERRIDE_BEGIN) || line.includes(OVERRIDE_END)) {
      findings.push(`the commit override marker appears in a line of text instead of on its own line: "${line}"`);
    } else if (state === 'inside' && line) {
      // Untrimmed at the start: release-please doesn't parse an indented line as a header.
      const entry = raw.trimEnd();
      if (!CONVENTIONAL_HEADER.test(entry) && !OVERRIDE_FOOTER.test(entry)) {
        findings.push(`not a Conventional Commit header or a Release-As / BREAKING CHANGE footer inside the commit override block: "${entry}"`);
      }
    }
  }
  if (state === 'inside') findings.push(`the commit override block has no ${OVERRIDE_END} line, so release-please would read the rest of the body as commits.`);
  return findings;
}

/**
 * `baton doctor` release checks. `files` maps repo-relative paths (RELEASE_FILES, `package.json`,
 * `Cargo.toml`) to their contents; a missing key means the file doesn't exist.
 */
export function releaseFindings({ config, files }) {
  const { enabled, publish } = config.release;
  const findings = [];
  const add = (message) => findings.push({ kind: 'release', message });
  const has = (path) => typeof files[path] === 'string';

  const missing = RELEASE_FILES.filter((f) => !has(f));
  if (enabled && missing.length) add(`release.enabled is true but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing (re-run the baton:init release step).`);
  const present = RELEASE_FILES.filter(has);
  if (!enabled && present.length) add(`release.enabled is false but ${present.join(', ')} ${present.length > 1 ? 'exist' : 'exists'}: finish turning releases on or off.`);

  if (has('release-please-config.json')) {
    const tagProblem = releaseTagProblem(files['release-please-config.json']);
    if (tagProblem) add(tagProblem);
  }
  if (publish.includes('npm')) {
    const problem = npmProblem(files['package.json']);
    if (problem) add(`release.publish has 'npm' but ${problem}.`);
  }
  if (publish.includes('crates')) {
    const problem = cratesProblem(files['Cargo.toml']);
    if (problem) add(`release.publish has 'crates' but ${problem}.`);
  }
  if (publish.length && has(RELEASE_WORKFLOW)) {
    for (const message of publishLayoutProblems(files[RELEASE_WORKFLOW], publish)) add(message);
  }
  return findings;
}

export const PUBLISH_STEP_NAMES = { npm: 'Publish to npm', crates: 'Publish to crates.io' };

const indentOf = (line) => line.length - line.trimStart().length;
const isBlankOrComment = (line) => line.trim() === '' || line.trim().startsWith('#');
const withoutComment = (line) => line.replace(/\s+#.*$/, '').trimEnd();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A job is a key directly under `jobs:` (at the indentation of the first key there); its block runs
// until the next line indented that much or less. Comment and blank lines never end a block.
// Returns the block's lines, or null when the job doesn't exist.
function jobBlock(workflow, job) {
  const lines = workflow.split(/\r?\n/);
  const jobsAt = lines.findIndex((line) => withoutComment(line) === 'jobs:');
  if (jobsAt === -1) return null;
  const first = lines.findIndex((line, i) => i > jobsAt && !isBlankOrComment(line));
  if (first === -1) return null;
  const jobIndent = indentOf(lines[first]);
  if (jobIndent === 0) return null;
  const start = lines.findIndex((line, i) => i >= first && indentOf(line) === jobIndent && withoutComment(line).trim() === `${job}:`);
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && !isBlankOrComment(line) && indentOf(line) <= jobIndent);
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, '$2');

// Accepts `environment: publish` (optionally quoted), `environment: { name: publish }` and
// the block form with a more-indented `name: publish` line.
function inEnvironmentPublish(block) {
  const keyIndent = indentOf(block.find((line) => !isBlankOrComment(line)) ?? '');
  const at = block.findIndex((line) => indentOf(line) === keyIndent && /^\s*environment:/.test(line));
  if (at === -1) return false;
  const value = withoutComment(block[at]).replace(/^\s*environment:/, '').trim();
  if (value) {
    const inline = value.match(/^\{.*?\bname:\s*(.*?)\s*[,}]/);
    return unquote(inline ? inline[1] : value) === 'publish';
  }
  const own = indentOf(block[at]);
  for (const line of block.slice(at + 1)) {
    if (isBlankOrComment(line)) continue;
    if (indentOf(line) <= own) return false;
    const name = withoutComment(line).trim().match(/^name:\s*(.*)$/);
    if (name) return unquote(name[1]) === 'publish';
  }
  return false;
}

function hasStepNamed(block, stepName) {
  const pattern = new RegExp(`^\\s*(?:-[ \\t]+)?name:[ \\t]*(["']?)${escapeRegExp(stepName)}\\1[ \\t]*(#.*)?$`);
  return block.some((line) => pattern.test(line));
}

function publishLayoutProblems(workflow, publish) {
  const problems = [];
  for (const job of ['publish-npm', 'publish-crates']) {
    if (jobBlock(workflow, job) !== null) problems.push(`${RELEASE_WORKFLOW} has a ${job} job, the old publish layout: re-run the release step of baton:init (trusted publishers must then name environment 'publish').`);
  }
  const block = jobBlock(workflow, 'publish');
  if (block !== null && !inEnvironmentPublish(block)) problems.push(`the publish job in ${RELEASE_WORKFLOW} has no 'environment: publish' line: re-run the release step of baton:init.`);
  for (const target of publish) {
    const stepName = PUBLISH_STEP_NAMES[target];
    // An unknown target is reported by the config check, not here.
    if (stepName && !hasStepNamed(block ?? [], stepName)) problems.push(`release.publish has '${target}' but the publish job in ${RELEASE_WORKFLOW} has no '${stepName}' step.`);
  }
  return problems;
}

// Tags must be `v<version>`, never `<component>-v<version>`. A package entry overrides the top level.
function releaseTagProblem(text) {
  let rp;
  try {
    rp = JSON.parse(text);
  } catch (err) {
    return `release-please-config.json is not valid JSON: ${err.message}`;
  }
  const pkg = rp?.packages?.['.'] ?? {};
  const setting = (key) => pkg[key] ?? rp?.[key];
  if (setting('include-component-in-tag') === false && setting('include-v-in-tag') === true) return null;
  return 'release-please-config.json must set include-component-in-tag: false and include-v-in-tag: true, so tags are v<version>.';
}

function npmProblem(text) {
  if (typeof text !== 'string') return 'there is no root package.json';
  try {
    // npm refuses to publish whenever `private` is truthy, not only when it is `true`.
    return JSON.parse(text)?.private ? 'the root package.json is private' : null;
  } catch (err) {
    return `the root package.json is not valid JSON (${err.message})`;
  }
}

function cratesProblem(text) {
  if (typeof text !== 'string') return 'there is no root Cargo.toml';
  return /^\s*publish\s*=\s*false\b/m.test(text) ? 'the root Cargo.toml sets publish = false' : null;
}

// --- Claim protocol -------------------------------------------------------
// GitHub has no atomic compare-and-set on issues, so a claim is a marker comment.
// The earliest claim posted after the most recent release wins; losers roll back.

export const CLAIM_MARK = 'baton:claim';
export const RELEASE_MARK = 'baton:release';

export function claimComment(user, nonce) {
  return `<!-- ${CLAIM_MARK} user=${user} nonce=${nonce} -->\nClaimed by @${user} via baton.`;
}

/** Release marker. `nonce` names the claim being released, so one session can't release another's. */
export function releaseComment(user, reason = 'released', nonce) {
  const id = nonce ? ` nonce=${nonce}` : '';
  return `<!-- ${RELEASE_MARK} user=${user}${id} -->\nReleased by @${user} (${reason}).`;
}

function parseMarker(body, mark) {
  const m = body.match(new RegExp(`<!--\\s*${mark}\\s+([^>]*?)\\s*-->`));
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/(\w+)=(\S+)/g)].map((x) => [x[1], x[2]]));
}

/**
 * Given chronological comments ({ body, author: { login } }), return the active claim
 * ({ user, nonce }) or null. Markers are only trusted when the comment author matches
 * the claimed user, so nobody can claim on someone else's behalf.
 */
export function activeClaim(comments) {
  let winner = null;
  for (const c of comments) {
    const author = c.author?.login;
    const rel = parseMarker(c.body ?? '', RELEASE_MARK);
    // Only the claimant can release, and only the claim it names (two sessions of the same
    // user race with different nonces; the loser's release must not clear the winner).
    if (rel && winner && author === winner.user && (!rel.nonce || rel.nonce === winner.nonce)) {
      winner = null;
      continue;
    }
    const claim = parseMarker(c.body ?? '', CLAIM_MARK);
    if (claim && claim.user === author && !winner) winner = { user: claim.user, nonce: claim.nonce };
  }
  return winner;
}
