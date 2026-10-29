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
  if (has(RELEASE_WORKFLOW)) {
    for (const target of publish) {
      const job = `publish-${target}`;
      if (!new RegExp(`^[ \\t]+${job}:`, 'm').test(files[RELEASE_WORKFLOW])) add(`release.publish has '${target}' but ${RELEASE_WORKFLOW} has no ${job} job.`);
    }
  }
  return findings;
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
    return JSON.parse(text)?.private === true ? 'the root package.json is private' : null;
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
