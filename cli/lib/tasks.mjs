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

/** PR body: the closing reference, the author's sections, then the validation that actually ran. */
export function prBody(number, extra, results) {
  const validation = results.map((r) => `- [x] ${r.name}: \`${r.run}\``).join('\n') || '- (no validation configured)';
  const middle = extra?.trim() ? `${extra.trim()}\n\n` : '';
  return `Closes #${number}\n\n${middle}## Validation\n${validation}\n`;
}

// --- Claim protocol -------------------------------------------------------
// GitHub has no atomic compare-and-set on issues, so a claim is a marker comment.
// The earliest claim posted after the most recent release wins; losers roll back.

export const CLAIM_MARK = 'baton:claim';
export const RELEASE_MARK = 'baton:release';

export function claimComment(user, nonce) {
  return `<!-- ${CLAIM_MARK} user=${user} nonce=${nonce} -->\nClaimed by @${user} via baton.`;
}

export function releaseComment(user, reason = 'released') {
  return `<!-- ${RELEASE_MARK} user=${user} -->\nReleased by @${user} (${reason}).`;
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
    if (rel && winner && (rel.user === winner.user || author === winner.user)) {
      winner = null;
      continue;
    }
    const claim = parseMarker(c.body ?? '', CLAIM_MARK);
    if (claim && claim.user === author && !winner) winner = { user: claim.user, nonce: claim.nonce };
  }
  return winner;
}
