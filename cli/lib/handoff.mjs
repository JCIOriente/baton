// Session-handoff logic behind `baton handoff`. Pure functions only, so they are easy to test.
import { fileURLToPath } from 'node:url';
import { labelNames } from './tasks.mjs';

/** The generic handoff prompt, shipped with the plugin and filled by `renderHandoff`. */
export const HANDOFF_TEMPLATE_PATH = fileURLToPath(new URL('../../templates/handoff.md', import.meta.url));

const SPEC_LINE = /^\s*(?:[-*]\s*)?Spec:\s*(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const STATUS_HEADING = /^##\s+Implementation status\s*$/;
const UNCHECKED = /^\s*[-*]\s+\[ \]\s+(.+?)\s*$/;
const RELEASE_LABEL = 'autorelease: pending';
/** PR titles and branch names are written by anyone with access to the repo; this bounds what reaches the prompt. */
const UNTRUSTED_MAX = 80;
const LIST_LIMIT = 1000;
const ANY_PLACEHOLDER = /\{\{[^}]*\}\}/g;
const KNOWN_PLACEHOLDERS = new Set(['{{project}}', '{{facts}}']);
const LEAVE_ALONE_SLOT = /^## Leave alone\n<FILL: [^>\n]*>/m;
// One pass over the template, so text from the facts is never scanned for placeholders.
const FILL_POINTS = /\{\{(project|facts)\}\}|^(## Leave alone\n<FILL: [^>\n]*)>/gm;
const ACTIVE = ['in-progress', 'review'];
const LISTED = ['ready', 'blocked'];
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const PENDING = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED']);
const REVIEW_DECISIONS = { REVIEW_REQUIRED: 'review required', APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested' };

/** Issues edited on the web arrive with `\r\n`. */
function lines(text) {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** `./docs/x.md` and `[x](docs/x.md)` -> `docs/x.md`. */
function normalizeSpecPath(value) {
  const link = value.trim().match(/^\[[^\]]*\]\(([^)]+)\)$/);
  return (link ? link[1] : value).trim().replace(/^\.\//, '');
}

/**
 * The spec path a task body names: the first `Spec:` line outside a code fence, up to ` · `.
 * Later `Spec:` lines are ignored. Returns null when there is none or its value is not a `.md` path.
 */
export function parseSpecRef(body = '') {
  let fenced = false;
  for (const line of lines(body)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const m = !fenced && line.match(SPEC_LINE);
    if (!m) continue;
    const spec = normalizeSpecPath(m[1].split(' · ')[0]);
    return spec.endsWith('.md') ? spec : null;
  }
  return null;
}

/**
 * Group tasks (`summarize` rows plus `body`) by the spec they name: the unit's group first, present
 * even with no tasks, then by spec path, then "No spec" (`spec: null`). Tasks keep number order.
 */
export function groupBySpec(tasks, specPath) {
  const unit = specPath ? normalizeSpecPath(specPath) : null;
  const bySpec = new Map();
  if (unit) bySpec.set(unit, []);
  for (const t of [...tasks].sort((a, b) => a.number - b.number)) {
    const spec = parseSpecRef(t.body);
    if (!bySpec.has(spec)) bySpec.set(spec, []);
    bySpec.get(spec).push(t);
  }
  const rank = (spec) => (spec === null ? 2 : spec === unit ? 0 : 1);
  return [...bySpec]
    .map(([spec, grouped]) => ({ spec, tasks: grouped }))
    .sort((a, b) => rank(a.spec) - rank(b.spec) || (rank(a.spec) === 1 ? a.spec.localeCompare(b.spec) : 0));
}

/** One state for a PR's `statusCheckRollup` (check runs and status contexts): failing beats pending beats passing. */
export function summarizeChecks(rollup) {
  if (!rollup?.length) return 'none';
  const states = rollup.map((c) => (c.status && c.status !== 'COMPLETED' ? c.status : c.conclusion || c.state || ''));
  if (states.some((s) => FAILED.has(s))) return 'failing';
  if (states.some((s) => PENDING.has(s))) return 'pending';
  return 'passing';
}

/**
 * Attach each open PR to the task its branch names (`issueOf`), as `pr` on that task. A PR whose
 * issue is not an open task (closed, triage, or no issue in the branch), and a second PR for the
 * same task, goes to `prsWithoutTask`; `release` marks the release PR.
 */
export function linkPullRequests(tasks, prs, issueOf) {
  const openTasks = new Set(tasks.filter((t) => t.status !== 'triage' && t.status !== 'done').map((t) => t.number));
  const linked = new Map();
  const prsWithoutTask = [];
  for (const pr of prs) {
    const issue = issueOf(pr.headRefName);
    if (openTasks.has(issue) && !linked.has(issue)) {
      linked.set(issue, { number: pr.number, draft: pr.isDraft, reviewDecision: pr.reviewDecision, checks: summarizeChecks(pr.statusCheckRollup) });
      continue;
    }
    prsWithoutTask.push({ number: pr.number, title: pr.title, branch: pr.headRefName, release: labelNames(pr.labels).includes(RELEASE_LABEL) });
  }
  return { tasks: tasks.map((t) => ({ ...t, pr: linked.get(t.number) ?? null })), prsWithoutTask };
}

/** Collapse untrusted text to one line, cut at `max` characters (the last one an ellipsis when cut). */
export function clip(text, max) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Unchecked `- [ ]` items under the spec's `## Implementation status`; null when the spec was not found. */
export function openStatusItems(specText) {
  if (specText === null) return null;
  const items = [];
  let inSection = false;
  let fenced = false;
  for (const line of lines(specText)) {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (/^#{1,2}\s/.test(line)) inSection = STATUS_HEADING.test(line);
    const m = inSection && line.match(UNCHECKED);
    if (m) items.push(m[1]);
  }
  return items;
}

/**
 * Work another session may own: (a) in-progress and review tasks outside the unit, "No spec" included;
 * (b) their PRs and every PR without a task; (c) non-stale worktrees whose task is not in the unit,
 * and named worktrees other than the current one. Ready, blocked and triage tasks never are.
 * All empty without a unit.
 */
export function leaveAloneCandidates(facts) {
  if (!facts.unit) return { tasks: [], prs: [], worktrees: [] };
  const isUnit = (g) => g.spec === facts.unit.spec;
  const inUnit = new Set(facts.groups.filter(isUnit).flatMap((g) => g.tasks.map((t) => t.number)));
  const active = facts.groups.filter((g) => !isUnit(g)).flatMap((g) => g.tasks.filter((t) => ACTIVE.includes(t.status)));
  const worktrees = facts.worktrees.filter((w) => !w.stale && (w.task !== null ? !inUnit.has(w.task) : w.branch !== null && !w.current));
  return {
    tasks: active.map((t) => t.number),
    prs: [...active.filter((t) => t.pr).map((t) => t.pr.number), ...facts.prsWithoutTask.map((p) => p.number)],
    worktrees: worktrees.map((w) => w.path),
  };
}

function prNotes(pr) {
  const notes = [`PR #${pr.number}`];
  if (pr.draft) notes.push('draft');
  notes.push(`ci ${pr.checks}`);
  if (REVIEW_DECISIONS[pr.reviewDecision]) notes.push(REVIEW_DECISIONS[pr.reviewDecision]);
  return notes;
}

/** `in-progress #160 (arnold) · ready: #170, #171`: a row per active task, a number list per other status. Titles are never printed. */
function taskSegments(tasks) {
  const segments = [];
  for (const status of ACTIVE) {
    for (const t of tasks.filter((x) => x.status === status)) {
      const notes = [...(t.assignees.length ? [t.assignees.join(', ')] : []), ...(t.pr ? prNotes(t.pr) : [])];
      segments.push(`${status} #${t.number}${notes.length ? ` (${notes.join(', ')})` : ''}`);
    }
  }
  for (const status of LISTED) {
    const numbers = tasks.filter((t) => t.status === status).map((t) => `#${t.number}`);
    if (numbers.length) segments.push(`${status}: ${numbers.join(', ')}`);
  }
  return segments;
}

function unitLines(group) {
  const segments = taskSegments(group.tasks);
  const out = [`Next session's unit: ${group.spec}`, segments.length ? `- ${segments.join(' · ')}` : '- no open tasks'];
  if (group.openStatusItems === null) out.push('- Implementation status: file not found');
  else if (group.openStatusItems.length) out.push(`- Implementation status still open: ${group.openStatusItems.map((i) => `"${i}"`).join(', ')}`);
  return out;
}

function otherWorkLines(groups, prsWithoutTask) {
  const out = [];
  for (const group of groups) {
    const segments = taskSegments(group.tasks);
    if (!segments.length) continue;
    if (group.spec !== null && group.openStatusItems === null) segments.push('Implementation status: file not found');
    out.push(`- ${group.spec ?? 'No spec'}: ${segments.join(' · ')}`);
  }
  if (prsWithoutTask.length) {
    const prs = prsWithoutTask.map((p) => `#${p.number} ${clip(p.title, UNTRUSTED_MAX)}${p.release ? ' [release PR]' : ''}`);
    out.push(`- Open PRs without a task: ${prs.join(' · ')}`);
  }
  return out.length ? ['Other open work:', ...out] : [];
}

function worktreeLine(worktrees) {
  if (!worktrees.length) return 'Worktrees: none';
  const items = worktrees.map((w) => {
    const notes = [];
    if (w.current) notes.push('current');
    if (w.stale) notes.push('missing; baton worktree prune');
    if (w.dirty) notes.push('uncommitted');
    if (!w.stale && w.branch !== null && w.unpushed === null) notes.push('not pushed');
    if (w.unpushed) notes.push(`${w.unpushed} unpushed`);
    const name = `${w.task !== null ? `#${w.task} ` : ''}${w.branch !== null ? clip(w.branch, UNTRUSTED_MAX) : '(detached)'}`;
    return `${name}${notes.length ? ` (${notes.join(', ')})` : ''} ${w.path}`;
  });
  return `Worktrees: ${items.join(' · ')}`;
}

function baseLine(base) {
  const head = `Base branch ${base.branch}:`;
  if (!base.tracking) return `${head} no remote-tracking ref`;
  const tracking = `${base.remote}/${base.branch}`;
  const sync = base.ahead || base.behind ? `${base.ahead} ahead, ${base.behind} behind ${tracking}` : `up to date with ${tracking}`;
  return `${head} ${sync} (as of last fetch)`;
}

function factsText(facts) {
  const unitGroup = facts.unit ? facts.groups.find((g) => g.spec === facts.unit.spec) : null;
  const out = unitGroup ? unitLines(unitGroup) : [];
  if (!facts.groups.some((g) => g.tasks.length)) out.push('No open tasks.');
  out.push(...otherWorkLines(facts.groups.filter((g) => g !== unitGroup), facts.prsWithoutTask));
  if (facts.triageCount > 0) out.push(`Not listed: ${facts.triageCount} triage issues`);
  if (facts.truncated) out.push(`Lists cut at ${LIST_LIMIT}; more exist.`);
  out.push(worktreeLine(facts.worktrees), baseLine(facts.base));
  return out.join('\n');
}

function candidatesText(facts) {
  if (!facts.unit) return 'none (no --spec)';
  const { tasks, prs, worktrees } = facts.leaveAloneCandidates;
  const worktreeName = (path) => {
    const w = facts.worktrees.find((x) => x.path === path);
    return w.task !== null ? String(w.task) : clip(w.branch, UNTRUSTED_MAX);
  };
  const items = [...tasks.map((n) => `#${n}`), ...prs.map((n) => `PR #${n}`), ...worktrees.map((p) => `worktree ${worktreeName(p)}`)];
  return items.length ? items.join(', ') : 'none';
}

/**
 * Fill the handoff template: `{{project}}`, `{{facts}}` (the "Where things stand" lines) and the
 * candidates in the Leave alone slot. Every `<FILL:` slot stays for the agent to fill.
 * Throws on any other `{{…}}` in the template, or when the Leave alone slot is missing.
 */
export function renderHandoff(template, facts, project) {
  const unknown = (template.match(ANY_PLACEHOLDER) ?? []).filter((t) => !KNOWN_PLACEHOLDERS.has(t));
  if (unknown.length) throw new Error(`Unknown placeholder in the handoff template: ${unknown.join(', ')}`);
  if (!LEAVE_ALONE_SLOT.test(template)) throw new Error('The handoff template has no <FILL: …> slot under "## Leave alone".');
  const values = { project, facts: factsText(facts) };
  return template.replace(FILL_POINTS, (_, name, slot) => (name ? values[name] : `${slot}; candidates: ${candidatesText(facts)}>`));
}
