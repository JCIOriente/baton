#!/usr/bin/env node
// baton: deterministic operations for the baton workflow.
// Skills tell the agent *when* to do something; this CLI does it the same way every time.

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG_DIR, CONFIG_FILE, configPath, DEFAULT_CONFIG, loadConfig, reviewerFocus, reviewersFor } from './lib/config.mjs';
import { buildContext } from './lib/context.mjs';
import { detectStacks, suggestSetup, suggestValidate } from './lib/detect.mjs';
import { applicableGates, coverageFindings, normalizeStep, orderFindings, STAGES } from './lib/gates.mjs';
import {
  addWorktreesLine,
  aheadBehind,
  branchName,
  currentBranch,
  currentTop,
  ensureExcluded,
  git,
  hasUncommittedChanges,
  isInWorktrees,
  issueFromBranch,
  listWorktrees,
  repoRoot,
  showFile,
  unpushedCount,
  worktreeBase,
} from './lib/git.mjs';
import { commitGatesStatus, guardStatus, installGuard, isDisposableClone, isMainCheckout } from './lib/git-guard.mjs';
import {
  groupBySpec,
  HANDOFF_TEMPLATE_PATH,
  leaveAloneCandidates,
  linkPullRequests,
  normalizeSpecPath,
  openStatusItems,
  parseSpecRef,
  renderHandoff,
} from './lib/handoff.mjs';
import { factsVsInstalled, installedVersions, loadProvenance, upstreamFindings } from './lib/provenance.mjs';
import { getProvider } from './lib/providers/github.mjs';
import {
  changelogGuard,
  labelNames,
  overrideFindings,
  parseDependencies,
  prBody,
  RELEASE_FILES,
  rankClaimable,
  releaseEnabledIn,
  releaseFindings,
  reviewState,
  statusOf,
  unblockable,
} from './lib/tasks.mjs';
import { BatonError, deepMerge, print, runShell, slugify } from './lib/util.mjs';
import { formatSummary, runSetup, runStage, stageJson } from './lib/verify.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `baton <command> [options]

Setup
  init [--force] [--labels]        Create .baton/config.json (detects stacks); --labels also creates GitHub labels
  labels                           Create/update status and priority labels on GitHub
  config                           Print the resolved config
  context                          Print the session context the hook injects
  hooks install [--json]           Install the git guard that refuses commits in the main checkout

Backlog
  list [--status S] [--mine]       List open tasks (S: triage|ready|in-progress|review|blocked)
  next [--limit N]                 Claimable tasks: ready, unassigned, dependencies closed, by priority
  show <n>                         Task details with dependency state
  create --title T [--body B | --body-file F] [--priority 0-3] [--depends-on 1,2] [--ready]
  status-set <n> <status>          Move a task to ready|in-progress|review|blocked
  unblock [--dry-run]              Move blocked tasks whose dependencies are all closed back to ready

Execution
  claim <n>                        Claim a task (race-safe)
  release <n> [--reason R]         Give a task back
  start <n> [--no-baseline]        Claim + worktree + branch, run setup, then a baseline validation
  worktree list | prune            Local worktrees / drop stale worktree records
  worktree add <name> [--setup] [--json]
                                   Worktree on a new branch <name> from the base branch, for work that is
                                   not a task (spec, plan, docs, config); --setup runs the setup steps
  worktree remove <n|name> [--force]
                                   Remove a task's or a named worktree; the branch is kept
  worktree clean [--dry-run] [--delete-branch] [--force] [--json]
                                   Remove worktrees whose PR is merged (closed too with --force); keeps
                                   open, no-PR, dirty and the current one; --delete-branch drops merged
                                   local branches
  status                           Local task and named worktrees
  handoff [--spec PATH] [--json]   Draft the next session's prompt from GitHub and git state (read-only)

Integration
  verify [--stage S] [--only NAME] Run the validation steps of stage S (commit|local|ci, default local);
                                   --only NAME keeps the steps named NAME or covering gate NAME
  reviewers [--all]                Reviewer briefs to dispatch, with the changed files each should focus on
  done [--draft] [--title T] [--body-file F] [--skip-review REASON]
                                   Verify, push and open a PR for the current task, mark it review.
                                   With requireReview, the body must hold \`Reviewed-at: <HEAD sha>\`

Maintenance
  doctor                           This repo: config, tools on PATH, stacks not enabled, dependencies
                                   outside what baton's guides assume (offline)
  upstream                         baton itself: upstream changes to adapted files and new releases
                                   outside asserted versions (network, needs gh)

Add --json to any read command for machine-readable output.`;

const commands = {
  init,
  labels,
  config: showConfig,
  context,
  hooks,
  list,
  next,
  show,
  create,
  'status-set': statusSet,
  unblock,
  reviewers,
  claim,
  release,
  start,
  worktree,
  status,
  handoff,
  verify,
  done,
  doctor,
  upstream,
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return print(USAGE);
  const fn = commands[cmd];
  if (!fn) throw new BatonError(`Unknown command '${cmd}'`, { hint: 'Run `baton help`.' });
  const end = rest.indexOf('--');
  if ((end === -1 ? rest : rest.slice(0, end)).some((a) => a === '-h' || a === '--help')) return print(USAGE);
  await fn(rest);
}

function opts(argv, options = {}) {
  try {
    return parseArgs({
      args: argv,
      options: { json: { type: 'boolean' }, ...options },
      allowPositionals: true,
    });
  } catch (err) {
    if (!err.code?.startsWith('ERR_PARSE_ARGS_')) throw err;
    throw new BatonError(err.message.split('. ')[0], { hint: 'Run `baton help`.' });
  }
}

function issueArg(positionals, i = 0) {
  const n = Number(String(positionals[i] ?? '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) throw new BatonError('Expected a task number, e.g. `baton claim 42`');
  return n;
}

function requireConfig() {
  const loaded = loadConfig();
  if (!loaded.found) throw new BatonError(...(branchWithoutConfig(loaded) ?? ['No .baton/config.json in this repo', { hint: 'Run `baton init` first.' }]));
  return loaded;
}

/**
 * The error for a linked worktree whose branch predates the main checkout's config, as
 * BatonError arguments; null otherwise. Such a branch needs the base branch merged in, not a
 * second config from `baton init`.
 */
function branchWithoutConfig({ root, top }) {
  if (top === root || !existsSync(configPath(root))) return null;
  return [
    "This checkout's branch has no .baton/config.json, but the main checkout has one",
    { hint: 'Rebase or merge the base branch into this branch; do not run `baton init` here.' },
  ];
}

/** The task the current checkout belongs to, from its branch name. */
function currentTask(config) {
  const n = issueFromBranch(config, currentBranch());
  if (!n) throw new BatonError(`Branch '${currentBranch()}' is not a task branch (${config.git.branchPrefix}/<n>-...)`);
  return n;
}

// --- Setup ----------------------------------------------------------------

function init(argv) {
  const { values } = opts(argv, { force: { type: 'boolean' }, labels: { type: 'boolean' } });
  const root = repoRoot();
  // Written into the checkout this runs in, so a reconfiguration can happen in a linked worktree.
  const top = currentTop();
  const path = configPath(top);
  if (existsSync(path) && !values.force) {
    throw new BatonError(`${relative(top, path)} already exists`, { hint: 'Use --force to overwrite.' });
  }
  const detected = detectStacks(top);
  const baseBranch = detectBaseBranch(root);
  const config = {
    project: root.split('/').pop(),
    stacks: detected.stacks,
    tasks: { provider: 'github', repo: null },
    git: { baseBranch, branchPrefix: DEFAULT_CONFIG.git.branchPrefix, mergeStrategy: 'squash' },
    setup: suggestSetup(detected),
    validate: suggestValidate(detected, { remote: DEFAULT_CONFIG.git.remote, baseBranch }),
    workflow: DEFAULT_CONFIG.workflow,
    hooks: DEFAULT_CONFIG.hooks,
    release: DEFAULT_CONFIG.release,
    docs: DEFAULT_CONFIG.docs,
    conventions: [],
  };
  mkdirSync(join(top, CONFIG_DIR), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  for (const d of [config.docs.specs, config.docs.plans]) mkdirSync(join(top, d), { recursive: true });
  // Next to the config, so the adoption commit carries both.
  const ignored = addWorktreesLine(join(top, '.gitignore'));
  // The config just written, merged over defaults.
  if (values.labels) getProvider(deepMerge(DEFAULT_CONFIG, config), root).ensureLabels();
  const added = ignored ? '\nAdded /.worktrees/ to .gitignore; commit it with .baton/config.json.' : '';
  print(values.json ? config : `Wrote ${relative(top, path)}\n${JSON.stringify(config, null, 2)}${added}`);
}

function detectBaseBranch(root) {
  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, allowFail: true });
  if (head.code === 0) return head.stdout.replace(/^origin\//, '');
  const local = git(['symbolic-ref', '--short', 'HEAD'], { cwd: root, allowFail: true });
  return local.code === 0 ? local.stdout : 'main';
}

function labels(argv) {
  const { values } = opts(argv);
  const { root, config } = requireConfig();
  const made = getProvider(config, root).ensureLabels();
  print(values.json ? made : `Labels ensured: ${made.join(', ')}`);
}

function showConfig(argv) {
  const { values } = opts(argv);
  const loaded = loadConfig();
  print(values.json ? loaded : { found: loaded.found, path: loaded.path, config: loaded.config });
}

function context() {
  let text;
  try {
    text = buildContext(loadConfig(), { pluginRoot: PLUGIN_ROOT });
  } catch (err) {
    // Never break session start. Outside a git repo there is nothing to say;
    // otherwise surface the problem as context so the agent can report it.
    if (err instanceof BatonError && err.message.startsWith('Not inside a git repository')) return;
    text = `<baton>\nbaton could not load this repo's config: ${err.message}\n</baton>`;
  }
  print(text);
}

function hooks(argv) {
  const [sub, ...rest] = argv;
  if (sub !== 'install') throw new BatonError(`Unknown hooks subcommand '${sub ?? ''}'`, { hint: 'Run `baton hooks install`.' });
  const { values } = opts(rest);
  const res = installGuard(repoRoot());
  if (values.json) return print(res);
  const lines = [`Wrote ${res.script} (the guard script, refreshed on every run).`];
  if (res.stub) {
    lines.push(`Wrote ${res.stub} (the pre-commit hook that runs it).`);
    lines.push(
      res.changed ? 'Commits in the main checkout are now refused while hooks.worktreeOnly is on.' : 'It was already installed; behavior is unchanged.',
    );
    lines.push(`To remove the guard, delete ${res.script}, ${res.gates} and ${res.stub}.`);
  } else {
    lines.push(`Left the hooks unchanged: ${res.reason}. Add these lines to that pre-commit hook or hook manager:`);
    lines.push(res.managerLine);
    lines.push(`To remove the guard, delete ${res.script}, ${res.gates} and those lines.`);
  }
  print(lines.join('\n'));
}

// --- Backlog --------------------------------------------------------------

function summarize(t, labelsCfg) {
  return {
    number: t.number,
    title: t.title,
    status: statusOf(t, labelsCfg),
    assignees: (t.assignees ?? []).map((a) => a.login),
    labels: labelNames(t.labels),
    url: t.url,
  };
}

function table(rows) {
  if (!rows.length) return '(none)';
  return rows.map((r) => `#${String(r.number).padEnd(5)} ${r.status.padEnd(12)} ${(r.assignees.join(',') || '-').padEnd(14)} ${r.title}`).join('\n');
}

function list(argv) {
  const { values } = opts(argv, { status: { type: 'string' }, mine: { type: 'boolean' } });
  const { root, config } = requireConfig();
  const provider = getProvider(config, root);
  let rows = provider.list({ assignee: values.mine ? '@me' : undefined }).map((t) => summarize(t, config.tasks.labels));
  if (values.status) rows = rows.filter((r) => r.status === values.status);
  print(values.json ? rows : table(rows));
}

function next(argv) {
  const { values } = opts(argv, { limit: { type: 'string', default: '5' } });
  const { root, config } = requireConfig();
  const provider = getProvider(config, root);
  const ranked = rankClaimable(provider.list({ label: config.tasks.labels.ready }), config.tasks.labels, provider.openNumbers())
    .slice(0, Number(values.limit))
    .map((t) => ({ number: t.number, title: t.title, priority: t.priority === 99 ? null : t.priority, deps: t.deps, url: t.url }));
  if (values.json) return print(ranked);
  print(ranked.length ? ranked.map((t) => `#${t.number} [p${t.priority ?? '-'}] ${t.title}`).join('\n') : 'No claimable tasks.');
}

function show(argv) {
  const { values, positionals } = opts(argv);
  const { root, config } = requireConfig();
  const provider = getProvider(config, root);
  const t = provider.get(issueArg(positionals));
  const open = provider.openNumbers();
  const deps = parseDependencies(t.body).map((d) => ({ number: d, open: open.has(d) }));
  const out = { ...summarize(t, config.tasks.labels), deps, body: t.body };
  if (values.json) return print(out);
  const depLine = deps.length ? deps.map((d) => `#${d.number}${d.open ? ' (open)' : ' (done)'}`).join(', ') : 'none';
  print(`#${out.number} ${out.title}\nstatus: ${out.status}  assignees: ${out.assignees.join(', ') || '-'}\ndepends on: ${depLine}\n${out.url}\n\n${out.body}`);
}

function create(argv) {
  const { values } = opts(argv, {
    title: { type: 'string' },
    body: { type: 'string' },
    'body-file': { type: 'string' },
    priority: { type: 'string' },
    'depends-on': { type: 'string' },
    ready: { type: 'boolean' },
    label: { type: 'string', multiple: true },
  });
  if (!values.title) throw new BatonError('--title is required');
  const { root, config } = requireConfig();
  let body = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : (values.body ?? '');
  if (values['depends-on']) {
    const refs = values['depends-on'].split(',').map((s) => `#${s.trim().replace(/^#/, '')}`);
    body = `${body.trimEnd()}\n\nDepends on: ${refs.join(', ')}\n`;
  }
  const labelList = [...(values.label ?? [])];
  if (values.ready) labelList.push(config.tasks.labels.ready);
  const priority = values.priority === undefined ? undefined : Number(values.priority);
  if (priority !== undefined && !(priority >= 0 && priority <= 3)) throw new BatonError('--priority must be 0-3');
  const created = getProvider(config, root).create({ title: values.title, body, labels: labelList, priority });
  print(values.json ? created : `Created #${created.number} ${created.url}`);
}

function statusSet(argv) {
  const { positionals } = opts(argv);
  const { root, config } = requireConfig();
  const n = issueArg(positionals);
  getProvider(config, root).setStatus(n, positionals[1]);
  print(`#${n} -> ${positionals[1]}`);
}

function unblock(argv) {
  const { values } = opts(argv, { 'dry-run': { type: 'boolean' } });
  const { root, config } = requireConfig();
  const provider = getProvider(config, root);
  const candidates = unblockable(provider.list({ label: config.tasks.labels.blocked }), provider.openNumbers());
  if (!values['dry-run']) for (const t of candidates) provider.setStatus(t.number, 'ready');
  const rows = candidates.map((t) => ({ number: t.number, title: t.title }));
  if (values.json) return print(rows);
  const verb = values['dry-run'] ? 'Would unblock' : 'Unblocked';
  print(rows.length ? rows.map((t) => `${verb} #${t.number} ${t.title}`).join('\n') : 'Nothing to unblock.');
}

function reviewers(argv) {
  const { values } = opts(argv, { all: { type: 'boolean' } });
  const { config } = requireConfig();
  const diff = branchDiff(config);
  const scoped = config.review.scopeToDiff && !values.all && diff;
  const selected = reviewersFor(config, scoped ? diff.files : undefined, scoped ? diff.text : '');
  const skipped = reviewersFor(config).filter((r) => !selected.includes(r));
  const rows = selected.map((name) => ({
    name,
    brief: join(PLUGIN_ROOT, 'reviewers', `${name}.md`),
    focus: diff ? reviewerFocus(config, name, diff.files) : undefined,
  }));
  if (values.json) return print({ reviewers: rows, skipped });
  const lines = rows.map((r) => `${r.name.padEnd(16)} ${r.brief}`);
  if (skipped.length) lines.push(`(skipped, the diff provably doesn't touch their stack: ${skipped.join(', ')}; --all to include)`);
  print(lines.join('\n'));
}

/**
 * This branch's changes vs the base branch, with the base ref it compared against, or undefined
 * if git can't tell (then nothing is skipped).
 */
function branchDiff(config) {
  const { remote, baseBranch } = config.git;
  for (const base of [`${remote}/${baseBranch}`, baseBranch]) {
    // --no-renames lists both sides of a rename, so moving CHANGELOG.md away still counts as touching it.
    const names = git(['diff', '--name-only', '--no-renames', `${base}...HEAD`], { allowFail: true });
    if (names.code !== 0) continue;
    const text = git(['diff', '--unified=0', `${base}...HEAD`], { allowFail: true });
    return { base, files: names.stdout ? names.stdout.split('\n') : [], text: text.code === 0 ? text.stdout : '' };
  }
  return undefined;
}

// --- Execution ------------------------------------------------------------

function claim(argv) {
  const { values, positionals } = opts(argv, { force: { type: 'boolean' } });
  const { root, config } = requireConfig();
  const n = issueArg(positionals);
  const res = claimTask(getProvider(config, root), n, values.force);
  if (values.json) return print({ number: n, already: res.already });
  print(res.already ? `#${n} was already yours.` : `Claimed #${n}.`);
}

function claimTask(provider, n, force) {
  if (!force) {
    const open = provider.openNumbers();
    const blocking = parseDependencies(provider.get(n).body).filter((d) => open.has(d));
    if (blocking.length) {
      throw new BatonError(`#${n} depends on open task(s) ${blocking.map((d) => `#${d}`).join(', ')}`, { hint: 'Finish those first, or pass --force.' });
    }
  }
  return provider.claim(n);
}

function release(argv) {
  const { positionals, values } = opts(argv, { reason: { type: 'string' } });
  const { root, config } = requireConfig();
  const n = issueArg(positionals);
  getProvider(config, root).release(n, { reason: values.reason ?? 'released' });
  print(`Released #${n}.`);
}

function start(argv) {
  const { values, positionals } = opts(argv, { force: { type: 'boolean' }, 'no-baseline': { type: 'boolean' } });
  const { root, config } = requireConfig();
  const n = issueArg(positionals);
  const res = claimTask(getProvider(config, root), n, values.force);
  const existing = listWorktrees(root).find((w) => issueFromBranch(config, w.branch) === n);
  // A stale record (directory gone) keeps its branch: createWorktree prunes it and checks the branch out again.
  const path = existing && !isStale(existing) ? existing.path : createWorktree(root, config, existing?.branch ?? branchName(config, n, res.task.title)).path;

  const setup = runSetup(config.setup, path);
  if (!setup.ok) {
    throw new BatonError(`Setup failed in ${path}`, {
      hint: 'Fix the setup step (see output above), then rerun `baton start`. The claim and worktree are kept.',
    });
  }
  const baseline = config.workflow.baselineOnStart && !values['no-baseline'] ? runValidation(config, path, { label: 'baseline' }) : null;

  const branch = currentBranch(path);
  if (values.json) return print({ number: n, path, branch, baseline: baseline && { ok: baseline.ok, results: baseline.results } });
  const lines = [`Task #${n} ready in ${path}`, `branch: ${branch}`];
  if (baseline && !baseline.ok) {
    const failed = baseline.results.find((r) => r.status === 'failed' && r.blocking);
    lines.push(`baseline: '${failed.name}' ALREADY FAILS before any change. Report it; don't count it against this task or "fix" it silently.`);
  } else if (baseline) lines.push('baseline: validation passes before any change.');
  for (const r of baseline?.results ?? []) {
    if (r.status === 'failed' && !r.blocking) lines.push(`baseline: advisory '${r.name}' fails (${r.reason})`);
  }
  lines.push('Next: work only inside that directory.');
  print(lines.join('\n'));
}

/** A worktree record whose directory is gone (removed by hand without `git worktree prune`). */
function isStale(w) {
  return w.prunable || !existsSync(w.path);
}

/**
 * Prunes the stale record `w` and returns the worktrees left. git never prunes a locked record,
 * so one that survives (e.g. a locked worktree on an unmounted drive) is an error, not success.
 */
function pruneStale(root, w) {
  git(['worktree', 'prune'], { cwd: root });
  const worktrees = listWorktrees(root);
  if (worktrees.some((x) => x.path === w.path)) {
    throw new BatonError(`Worktree ${w.path} is missing on disk but its record is locked`, {
      hint: `Remount it if it lives on a removable drive, or run \`git worktree unlock ${w.path}\` and retry.`,
    });
  }
  return worktrees;
}

/**
 * Removes the worktree `w` with `git worktree remove` (`force` discards uncommitted changes), or
 * only clears its record when the folder is already gone. Returns 'removed' or 'pruned'. The
 * branch is always kept.
 */
function removeWorktree(root, w, { force = false } = {}) {
  if (isStale(w)) {
    pruneStale(root, w);
    return 'pruned';
  }
  git(['worktree', 'remove', ...(force ? ['--force'] : []), w.path], { cwd: root });
  return 'removed';
}

/**
 * The worktree for `branch` under `worktreeBase`: an existing one is reused, an existing local
 * branch is checked out, otherwise the branch starts from the remote base with no upstream.
 * A stale record for the branch is pruned first, so the worktree is made again. A new worktree
 * is refused over a tracked `.worktrees`. Either way the folder is added to `info/exclude` first.
 */
function createWorktree(root, config, branch) {
  let worktrees = listWorktrees(root);
  let existing = worktrees.find((w) => w.branch === branch);
  if (existing && isStale(existing)) {
    worktrees = pruneStale(root, existing);
    existing = worktrees.find((w) => w.branch === branch);
  }
  // Also on reuse, so a removed line comes back.
  const { warning } = ensureExcluded(root);
  if (warning) process.stderr.write(`warning: ${warning}\n`);
  if (existing) return { path: existing.path, created: false };
  if (git(['ls-files', '--', '.worktrees'], { cwd: root }).stdout) {
    throw new BatonError('.worktrees is tracked in this repo; baton keeps worktrees there');
  }
  const path = join(worktreeBase(root), branch.replace(/\//g, '-'));
  // Checked before git runs, so a clash never leaves a new branch behind.
  const occupant = worktrees.find((w) => w.path === path);
  if (occupant || existsSync(path)) {
    throw new BatonError(`${path} is already taken${occupant ? ` by the worktree on ${occupant.branch ?? '(detached HEAD)'}` : ''}`, {
      hint: 'Pick another name.',
    });
  }
  const localBranch = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root, allowFail: true });
  mkdirSync(dirname(path), { recursive: true });
  if (localBranch.code === 0) {
    git(['worktree', 'add', path, branch], { cwd: root });
    return { path, created: true };
  }
  const { remote, baseBranch } = config.git;
  const fetched = git(['fetch', remote, baseBranch], { cwd: root, allowFail: true }).code === 0;
  const remoteBase = git(['rev-parse', '--verify', '--quiet', `${remote}/${baseBranch}`], { cwd: root, allowFail: true });
  const base = remoteBase.code === 0 ? `${remote}/${baseBranch}` : baseBranch;
  if (remoteBase.code !== 0) process.stderr.write(`warning: ${remote}/${baseBranch} not found; branching from the local ${baseBranch}.\n`);
  else if (!fetched) process.stderr.write(`warning: could not fetch ${remote}/${baseBranch}; branching from the last fetched ${base}.\n`);
  git(['worktree', 'add', '--no-track', '-b', branch, path, base], { cwd: root });
  return { path, created: true };
}

function worktree(argv) {
  const [sub, ...rest] = argv;
  const { values, positionals } = opts(rest, {
    force: { type: 'boolean' },
    setup: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'delete-branch': { type: 'boolean' },
  });
  const { root, config } = requireConfig();
  if (sub === 'list' || !sub) {
    const rows = listWorktrees(root).map((w) => ({ ...w, task: issueFromBranch(config, w.branch) }));
    if (values.json) return print(rows);
    return print(rows.map((w) => `${w.task ? `#${w.task}`.padEnd(7) : '-'.padEnd(7)} ${w.branch ?? '(detached)'}  ${w.path}`).join('\n'));
  }
  if (sub === 'add') {
    const branch = slugify(positionals[0] ?? '');
    if (!branch) throw new BatonError('Expected a worktree name with letters or digits, e.g. `baton worktree add orgs-spec`');
    if (branch === config.git.baseBranch) {
      throw new BatonError(`'${branch}' is the base branch`, { hint: 'Pick another name; work on the base branch goes through a branch of its own.' });
    }
    // git cannot hold refs/heads/task next to refs/heads/task/12-x, so the task prefix is off limits.
    if (`${config.git.branchPrefix}/`.startsWith(`${branch}/`)) {
      throw new BatonError(`'${branch}' clashes with the task branch prefix '${config.git.branchPrefix}/'`, { hint: 'Pick another name.' });
    }
    if (listWorktrees(root).some((w) => w.branch === branch && w.path === root)) {
      throw new BatonError(`Branch ${branch} is checked out in the main checkout`, {
        hint: `Switch the main checkout back to ${config.git.baseBranch}, or pick another name.`,
      });
    }
    const { path, created } = createWorktree(root, config, branch);
    if (values.setup && !runSetup(config.setup, path).ok) {
      throw new BatonError(`Setup failed in ${path}`, { hint: 'Fix the setup step (see output above), then rerun with --setup. The worktree is kept.' });
    }
    if (values.json) return print({ path, branch, created });
    return print([`Worktree ${created ? 'ready' : 'already exists'} in ${path}`, `branch: ${branch}`, 'Next: work only inside that directory.'].join('\n'));
  }
  if (sub === 'remove') {
    // A number is a task (`worktree remove 12`); anything else is a name from `worktree add`.
    // Only a positive number can be a task, so a name like `0` from `worktree add` takes the name path.
    const n = /^#?\d*[1-9]\d*$/.test(positionals[0] ?? '') ? issueArg(positionals) : null;
    const name = n ? null : slugify(positionals[0] ?? '');
    if (!n && !name) throw new BatonError('Expected a task number or worktree name, e.g. `baton worktree remove orgs-spec`');
    const label = n ? `#${n}` : name;
    const all = listWorktrees(root);
    // An all-digit name from `worktree add` (e.g. 2027) is tried when no task matches the number.
    const wt = n
      ? (all.find((w) => issueFromBranch(config, w.branch) === n) ?? all.find((w) => w.branch === slugify(positionals[0])))
      : all.find((w) => w.branch === name);
    if (!wt) throw new BatonError(`No worktree for ${label}`);
    if (!isStale(wt) && !values.force && hasUncommittedChanges(wt.path)) {
      throw new BatonError(`Worktree for ${label} has uncommitted changes`, { hint: 'Commit or discard them, or pass --force.' });
    }
    if (removeWorktree(root, wt, { force: values.force }) === 'pruned') {
      return print(`Worktree ${wt.path} was already missing on disk; cleared its record (branch ${wt.branch} kept).`);
    }
    return print(`Removed worktree ${wt.path} (branch ${wt.branch} kept).`);
  }
  if (sub === 'prune') {
    git(['worktree', 'prune'], { cwd: root });
    return print('Pruned stale worktree records.');
  }
  if (sub === 'clean') return cleanWorktrees(root, config, values);
  throw new BatonError(`Unknown worktree subcommand '${sub}'`);
}

/**
 * `worktree clean`: removes the worktrees whose PR is merged (or closed, with --force). The whole
 * plan is made before anything changes, so a gh failure leaves every worktree as it was. Only
 * worktrees inside `.worktrees/` are judged; the others are listed and never touched.
 */
function cleanWorktrees(root, config, values) {
  const provider = getProvider(config, root);
  const here = currentTop();
  const plan = listWorktrees(root)
    .filter((w) => w.path !== root)
    .map((w) => ({ w, ...cleanDecision(provider, config, w, { root, here, force: values.force }) }));
  const dryRun = values['dry-run'];
  let hasFailure = false;
  // Each row is carried out on its own, so one failure still leaves a full report of what changed.
  const rows = plan.map(({ w, pr, state, action, reason }) => {
    const row = { branch: w.branch, path: w.path, task: issueFromBranch(config, w.branch), pr, state, action, reason };
    const isMergedRemoval = state === 'merged' && action === 'remove';
    const deleteBranch = values['delete-branch'] && isMergedRemoval;
    if (dryRun) {
      if (!isMergedRemoval) return row;
      return { ...row, reason: `${reason}; branch ${deleteBranch ? 'would be deleted' : 'kept'}` };
    }
    if (action !== 'remove' && action !== 'prune') return row;
    try {
      removeWorktree(root, w);
    } catch (err) {
      if (!(err instanceof BatonError)) throw err;
      hasFailure = true;
      return { ...row, action: 'skip', reason: `removal failed: ${oneLine(err.message)}` };
    }
    if (!isMergedRemoval) return row;
    if (!deleteBranch) return { ...row, reason: `${reason}; branch kept` };
    const tip = git(['rev-parse', '--short', `refs/heads/${w.branch}`], { cwd: root }).stdout;
    // -D, not -d: after a squash merge git never sees the branch as merged.
    const deleted = git(['branch', '-D', w.branch], { cwd: root, allowFail: true });
    if (deleted.code !== 0) {
      hasFailure = true;
      return { ...row, reason: `${reason}; branch deletion failed: ${oneLine(deleted.stderr)}` };
    }
    return { ...row, reason: `${reason}; branch deleted (was ${tip})` };
  });
  if (hasFailure) process.exitCode = 1;
  if (values.json) return print(rows);
  if (!rows.length) return print('No worktrees to clean.');
  const groups = [
    [dryRun ? 'Would remove' : 'Removed', ['remove', 'prune']],
    ['Kept', ['keep']],
    ['Skipped', ['skip']],
  ];
  const lines = [];
  for (const [heading, actions] of groups) {
    const members = rows.filter((r) => actions.includes(r.action));
    if (!members.length) continue;
    lines.push(`${heading}:`, ...members.map((r) => `  ${r.branch ?? r.path}  ${r.reason}`));
  }
  const outside = rows.filter((r) => r.action === 'outside');
  if (outside.length) {
    lines.push(
      `Outside .worktrees/ (not cleaned; every worktree belongs in ${worktreeBase(root)}/):`,
      ...outside.map((r) => `  ${r.branch ?? r.path}  ${r.path}`),
    );
  }
  if (dryRun) lines.push('Dry run: nothing changed.');
  print(lines.join('\n'));
}

/**
 * Sorts worktree `w` into exactly one clean-up category. The PR state on GitHub is the signal,
 * since squash merges hide merged branches from `git branch --merged`. Changes nothing.
 * A worktree outside `.worktrees/` is never judged, so it needs no PR lookup.
 * @returns {{ pr: number|null, state: string, action: 'remove'|'prune'|'keep'|'skip'|'outside', reason: string }}
 */
function cleanDecision(provider, config, w, { root, here, force }) {
  const decide = (state, action, reason, pr = null) => ({ pr, state, action, reason });
  if (!isInWorktrees(root, w.path)) return decide('outside', 'outside', 'outside .worktrees/');
  if (w.path === here) return decide('current', 'keep', 'current worktree');
  // git refuses to remove or prune a locked worktree.
  if (w.locked) return decide('locked', 'skip', `locked; \`git worktree unlock ${w.path}\` to let clean see it`);
  if (isStale(w)) return decide('stale', 'prune', 'folder missing; record cleared');
  if (!w.branch) return decide('detached', 'skip', 'detached HEAD');

  const pr = fromGithub(() => provider.latestPullRequest(w.branch));
  const prNumber = pr?.number ?? null;
  if (hasUncommittedChanges(w.path)) return decide('dirty', 'keep', 'uncommitted changes', prNumber);
  if (!pr) return decide('no-pr', 'keep', noPrReason(provider, config, w));
  // The PR head, not the remote branch: a squash merge usually deletes the remote branch.
  // Exit 1 means "not an ancestor"; any other failure means git can't tell, usually because the PR
  // head (a commit added on GitHub) was never fetched. Both keep the worktree, with different reasons.
  const isAncestor = () => git(['merge-base', '--is-ancestor', 'HEAD', pr.headRefOid], { cwd: w.path, allowFail: true }).code;
  let ancestry = isAncestor();
  // Once the branch is deleted, only refs/pull/<N>/head still reaches the head. Fetching it updates
  // no ref but FETCH_HEAD, so a dry run does it too and its plan stays accurate.
  const pullRef = `pull/${pr.number}/head`;
  let fetched = null;
  if (ancestry !== 0 && ancestry !== 1) {
    fetched = git(['fetch', '--quiet', config.git.remote, pullRef], { cwd: w.path, allowFail: true });
    if (fetched.code === 0) ancestry = isAncestor();
  }
  if (ancestry === 1) return decide('dirty', 'keep', `commits not in PR #${pr.number}`, prNumber);
  if (ancestry !== 0) {
    const hint = `git fetch ${config.git.remote} ${pullRef}`;
    // A network or auth failure must not look like a head that's missing on the remote.
    const failure = fetched && fetched.code !== 0 ? `; fetch failed: ${oneLine(fetched.stderr)}` : '';
    return decide('unverified', 'keep', `PR #${pr.number} head ${pr.headRefOid.slice(0, 7)} not available locally; run \`${hint}\`${failure}`, prNumber);
  }
  if (pr.state === 'MERGED') return decide('merged', 'remove', `PR #${pr.number} merged`, prNumber);
  if (pr.state === 'CLOSED') {
    return force
      ? decide('closed', 'remove', `PR #${pr.number} closed without merging`, prNumber)
      : decide('closed', 'skip', `PR #${pr.number} closed without merging; --force removes it`, prNumber);
  }
  return decide('open', 'keep', `PR #${pr.number} open`, prNumber);
}

function noPrReason(provider, config, w) {
  const parts = ['no PR'];
  const task = issueFromBranch(config, w.branch);
  if (task && isIssueClosed(provider, task)) parts.push(`issue #${task} is closed`);
  const { remote, baseBranch } = config.git;
  const base = [`${remote}/${baseBranch}`, baseBranch].find(
    (ref) => git(['rev-parse', '--verify', '--quiet', ref], { cwd: w.path, allowFail: true }).code === 0,
  );
  if (base && git(['rev-list', '--count', `${base}..HEAD`], { cwd: w.path }).stdout === '0') parts.push(`no commits beyond ${base}`);
  return parts.join('; ');
}

/** False when the issue can't be read (deleted, transferred): it only adds detail to a kept row. */
function isIssueClosed(provider, task) {
  try {
    return provider.get(task).state.toLowerCase() === 'closed';
  } catch (err) {
    if (!(err instanceof BatonError)) throw err;
    return false;
  }
}

function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Runs a GitHub lookup, turning a gh failure into a hint to log in; the defaults are `worktree clean`'s. */
function fromGithub(lookup, { what = 'PR state', hint = 'Install gh and run `gh auth login`, then retry. Nothing was changed.' } = {}) {
  try {
    return lookup();
  } catch (err) {
    if (!(err instanceof BatonError)) throw err;
    throw new BatonError(`Could not read ${what} from GitHub: ${err.message}`, { hint });
  }
}

/** The linked worktrees as `baton status` shows them: task ones by number, then named ones by branch. */
function worktreeRows(root, config) {
  const here = currentTop();
  return listWorktrees(root)
    .filter((w) => w.path !== root)
    .map((w) => {
      const stale = isStale(w);
      return {
        task: issueFromBranch(config, w.branch),
        branch: w.branch,
        path: w.path,
        current: w.path === here,
        dirty: !stale && hasUncommittedChanges(w.path),
        stale,
      };
    })
    .sort((a, b) => (a.task && b.task ? a.task - b.task : a.task ? -1 : b.task ? 1 : (a.branch ?? '(detached)').localeCompare(b.branch ?? '(detached)')));
}

function status(argv) {
  const { values } = opts(argv);
  const { root, config } = requireConfig();
  // Not in worktreeRows, so handoff's facts keep their shape.
  const rows = worktreeRows(root, config).map((r) => ({ ...r, outside: !isInWorktrees(root, r.path) }));
  if (values.json) return print(rows.map(({ stale, ...row }) => row));
  const note = (r) => `${r.stale ? ' (missing; baton worktree prune)' : r.dirty ? ' (uncommitted)' : ''}${r.outside ? ' (outside .worktrees/)' : ''}`;
  print(
    rows.length
      ? rows.map((r) => `${r.current ? '*' : ' '} ${r.task ? `#${r.task} ` : ''}${r.branch ?? '(detached)'}${note(r)}\n    ${r.path}`).join('\n')
      : 'No worktrees.',
  );
}

const GITHUB_LIST_LIMIT = 1000;

/**
 * `handoff`: the next session's prompt (or, with --json, its facts) from one issue list, one PR
 * list and local git state. Reads only: git takes no optional locks, so not even the index changes.
 */
function handoff(argv) {
  process.env.GIT_OPTIONAL_LOCKS = '0';
  const { values } = opts(argv, { spec: { type: 'string' } });
  const { root, config } = requireConfig();
  const unitSpec = values.spec === undefined ? null : canonicalSpec(values.spec);
  const provider = getProvider(config, root);
  const { issues, prs } = fromGithub(
    () => ({ issues: provider.list({ limit: GITHUB_LIST_LIMIT }), prs: provider.listPullRequests({ limit: GITHUB_LIST_LIMIT }) }),
    {
      what: 'tasks and PRs',
      hint: 'Install gh and run `gh auth login`, then retry.',
    },
  );
  const truncated = issues.length >= GITHUB_LIST_LIMIT || prs.length >= GITHUB_LIST_LIMIT;
  if (truncated) process.stderr.write(`warning: GitHub returned ${GITHUB_LIST_LIMIT} open issues or PRs, the most read; more exist and are left out.\n`);

  const rows = issues.map((t) => ({ ...summarize(t, config.tasks.labels), body: t.body }));
  const tasks = rows.filter((t) => t.status !== 'triage');
  const linked = linkPullRequests(tasks, prs, (branch) => issueFromBranch(config, branch));
  const groups = groupBySpec(linked.tasks, unitSpec).map((g) => ({
    spec: g.spec,
    tasks: g.tasks.map((t) => ({ number: t.number, title: t.title, status: t.status, assignees: t.assignees, pr: t.pr })),
    openStatusItems: g.spec === null ? null : openStatusItems(readSpec(config, g.spec)),
  }));
  let unit = null;
  if (unitSpec !== null) {
    // groupBySpec puts the unit's group first, even with no tasks.
    const [group] = groups;
    const found = group.openStatusItems !== null;
    if (!found && !group.tasks.length)
      throw new BatonError(`No spec ${unitSpec} on ${config.git.remote}/${config.git.baseBranch} or in the working tree, and no open task names it`);
    unit = { spec: unitSpec, found };
  }
  const worktrees = worktreeRows(root, config).map((w) => ({ ...w, unpushed: w.stale || w.branch === null ? null : unpushedCount(w.path) }));
  const sync = aheadBehind(root, config.git.remote, config.git.baseBranch);
  const facts = {
    schemaVersion: 1,
    unit,
    groups,
    prsWithoutTask: linked.prsWithoutTask,
    worktrees,
    base: { branch: config.git.baseBranch, remote: config.git.remote, ahead: sync?.ahead ?? null, behind: sync?.behind ?? null, tracking: sync !== null },
    leaveAloneCandidates: null,
    triageCount: rows.length - tasks.length,
    truncated,
  };
  facts.leaveAloneCandidates = leaveAloneCandidates(facts);
  if (values.json) return print(facts);
  print(renderHandoff(readFileSync(HANDOFF_TEMPLATE_PATH, 'utf8'), facts, config.project ?? basename(root)));
}

/**
 * A repo-relative spec's text from `<remote>/<baseBranch>`, else from the current checkout; null
 * when neither has it. Paths come from issue bodies, so one that leaves the checkout is not read.
 */
function readSpec(config, path) {
  const top = currentTop();
  const fromBase = showFile(top, `${config.git.remote}/${config.git.baseBranch}`, path);
  if (fromBase !== null) return fromBase;
  const file = resolve(top, path);
  return file.startsWith(top + sep) && statSync(file, { throwIfNoEntry: false })?.isFile() ? readFileSync(file, 'utf8') : null;
}

/**
 * `--spec` as the repo-relative path task bodies use, so any spelling of the same file finds its
 * tasks: resolved against the checkout (with the disk's own case when the file is there), POSIX
 * separators. Throws for a path outside the checkout or not in the `Spec:` line's form.
 */
function canonicalSpec(value) {
  const spec = normalizeSpecPath(value);
  if (!spec) throw new BatonError('--spec needs a path');
  const top = realpathSync.native(currentTop());
  const file = resolve(top, spec);
  const onDisk = existsSync(file) ? realpathSync.native(file) : file;
  const rel = relative(top, onDisk);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new BatonError(`--spec ${value} is outside this checkout`);
  const path = rel.split(sep).join(posix.sep);
  if (parseSpecRef(`Spec: ${path}`) !== path)
    throw new BatonError(`--spec ${value} is not a spec path`, { hint: 'Name a .md file, e.g. docs/specs/<name>.md.' });
  return path;
}

// --- Integration ----------------------------------------------------------

/** Run the validate steps of `stage` (see runStage); `only` narrows the run. */
function runValidation(config, top, { stage = 'local', only, label = 'verify' } = {}) {
  if (!STAGES.includes(stage)) throw new BatonError(`unknown stage '${stage}'`, { hint: `Use one of: ${STAGES.join(', ')}.` });
  return runStage(config.validate, top, { stage, only, label, skip: config.gates?.skip });
}

function verify(argv) {
  const { values } = opts(argv, { stage: { type: 'string' }, only: { type: 'string' } });
  const { config } = requireConfig();
  const res = runValidation(config, currentTop(), { stage: values.stage, only: values.only });
  print(values.json ? stageJson(res) : formatSummary(res));
  if (!res.ok) process.exitCode = 1;
}

function done(argv) {
  const { values } = opts(argv, {
    draft: { type: 'boolean' },
    'body-file': { type: 'string' },
    title: { type: 'string' },
    'skip-review': { type: 'string' },
  });
  const { root, config } = requireConfig();
  const top = currentTop();
  const n = currentTask(config);
  let extra = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : '';
  if (hasUncommittedChanges(top)) throw new BatonError('Uncommitted changes in this worktree', { hint: 'Commit your work before `baton done`.' });

  // Changelog gate: read the switch from the base branch, not the worktree, so the PR that turns
  // releases on can still remove the hand-written `## Unreleased` section.
  const diff = branchDiff(config);
  let releaseEnabled = false;
  if (diff) {
    // Only "not in the base tree" means off; any other git failure is reported, not read as off.
    const path = `${CONFIG_DIR}/${CONFIG_FILE}`;
    const inBase = git(['ls-tree', '--name-only', diff.base, '--', path], { cwd: top }).stdout !== '';
    const baseConfig = inBase ? git(['show', `${diff.base}:${path}`], { cwd: top }).stdout : '';
    releaseEnabled = releaseEnabledIn(baseConfig);
    const guard = changelogGuard({ files: diff.files, releaseEnabled });
    if (!guard.ok) throw new BatonError(guard.reason);
  } else {
    process.stderr.write('warning: the base branch could not be resolved, so the CHANGELOG and commit override checks were skipped.\n');
  }

  // Review gate: a draft PR may precede review; a ready PR needs a review of exactly this commit,
  // or an explicit, visible reason for skipping it.
  if (config.workflow.requireReview && !values.draft) {
    if (values['skip-review']) {
      extra = `${extra.trim()}\n\n**Review skipped:** ${values['skip-review']}\n`;
    } else {
      const state = reviewState(extra, git(['rev-parse', 'HEAD'], { cwd: top }).stdout);
      if (!state.ok) {
        throw new BatonError(`Not reviewed: ${state.reason}`, {
          hint: 'Run baton:review on the current HEAD, put a `Reviewed-at: <sha>` line in --body-file, or pass --draft / --skip-review "<reason>".',
        });
      }
    }
  }

  // Commit override gate: release-please reads the squash-merged PR body, so a stray marker would
  // replace this PR's changelog entry. Checked before validation to fail fast on the author's text,
  // and again on the final body, whose lines carry config step names and skip or advisory reasons.
  const checkOverrides = (body) => {
    if (!releaseEnabled) return;
    const findings = overrideFindings(body);
    if (findings.length) {
      throw new BatonError(`The PR body would drop changelog entries:\n${findings.map((f) => `  - ${f}`).join('\n')}`, {
        hint: 'In prose, write "commit override block" instead of the marker. Keep a real block well-formed: the BEGIN line, Conventional Commit headers or Release-As / BREAKING CHANGE footers, then the END line.',
      });
    }
  };
  checkOverrides(prBody(n, extra, null));

  const res = runValidation(config, top);
  process.stderr.write(`\n${formatSummary(res)}\n`);
  if (!res.ok) throw new BatonError('Validation failed; not opening a PR.');
  const body = prBody(n, extra, res);
  checkOverrides(body);

  const provider = getProvider(config, root);
  const branch = currentBranch(top);
  // Task branches have a single owner (the claimant), so a lease-protected force push
  // after a rebase is safe; it still refuses if someone else pushed to the branch.
  git(['push', '--force-with-lease', '-u', config.git.remote, branch], { cwd: top });
  const task = provider.get(n);
  let pr = provider.findPullRequest(branch);
  if (!pr) {
    const url = provider.openPullRequest({ branch, title: values.title ?? task.title, body, base: config.git.baseBranch, draft: values.draft });
    pr = { url };
  }
  provider.setStatus(n, 'review');
  if (values.json) return print({ number: n, pr: pr.url });
  print(`#${n} is in review: ${pr.url}`);
}

// --- Maintenance ----------------------------------------------------------

function doctor(argv) {
  const { values } = opts(argv);
  const findings = [];
  const loaded = loadConfig();
  if (!loaded.found) {
    const branch = branchWithoutConfig(loaded);
    const message = branch ? `${branch[0]} (${branch[1].hint.replace(/\.$/, '')})` : 'No .baton/config.json (run `baton init`)';
    findings.push({ kind: 'config', message });
  }
  // The checks of the config and its files read the checkout this runs in (`top`); the guard
  // checks read the main checkout (`root`).
  const { root, top, config } = loaded;

  for (const step of [...config.setup, ...config.validate]) {
    const tool = step.run.trim().split(/\s+/)[0];
    if (!/^[\w.-]+$/.test(tool)) continue;
    if (runShell(`command -v ${tool} >/dev/null 2>&1`) !== 0)
      findings.push({ kind: 'tool', message: `'${tool}' (used by '${step.name ?? step.run}') is not on PATH` });
    if (step.cwd && !existsSync(join(top, step.cwd)))
      findings.push({ kind: 'config', message: `cwd '${step.cwd}' of '${step.name ?? step.run}' does not exist` });
  }
  const notEnabled = detectStacks(top).stacks.filter((s) => !config.stacks.includes(s));
  if (notEnabled.length) findings.push({ kind: 'stacks', message: `Detected but not enabled: ${notEnabled.join(', ')}` });

  for (const f of factsVsInstalled(loadProvenance(PLUGIN_ROOT), installedVersions(top))) {
    findings.push({
      ...f,
      message: `${f.pkg.replace(/^\w+:/, '')} ${f.installed} installed, but ${f.file} assumes ${f.requires} (${f.fact}). Upgrade, or record the exception in the project conventions.`,
    });
  }

  if (loaded.found) {
    const files = {};
    for (const path of [...RELEASE_FILES, 'package.json', 'Cargo.toml']) {
      if (existsSync(join(top, path))) files[path] = readFileSync(join(top, path), 'utf8');
    }
    findings.push(...releaseFindings({ config, files }));
    findings.push(...coverageFindings(config, applicableGates({ root: top, config })));
    findings.push(...orderFindings(config.validate.map(normalizeStep)));
  }

  // The guard stands down in CI and cloud sessions; a bare repo has no main checkout to protect.
  if (loaded.found && config.hooks.worktreeOnly && !isDisposableClone() && isMainCheckout(root)) {
    const guard = guardStatus(root);
    if (guard !== 'installed') findings.push({ kind: 'worktree', message: `The git guard is ${guard} (run \`baton hooks install\`)` });
    // symbolic-ref also answers on an unborn branch, where `rev-parse HEAD` fails.
    const head = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, allowFail: true });
    const branch = head.code === 0 ? head.stdout : 'a detached HEAD';
    if (branch !== config.git.baseBranch) {
      findings.push({
        kind: 'worktree',
        message: `The main checkout ${root} is on ${branch}, not ${config.git.baseBranch}. Switch it back; changes happen in linked worktrees.`,
      });
    }
  }
  // Unlike the guard, the commit gates run in linked worktrees, so they matter whatever hooks.worktreeOnly says.
  if (loaded.found && !isDisposableClone() && commitGatesStatus(root, config) === 'missing') {
    findings.push({ kind: 'worktree', message: 'The commit-gates hook is missing, but a validate step runs in the commit stage (run `baton hooks install`)' });
  }

  if (values.json) print(findings);
  else print(findings.length ? findings.map((f) => `- [${f.kind}] ${f.message}`).join('\n') : 'No problems found.');
  if (findings.length) process.exitCode = 1;
}

async function upstream(argv) {
  const { values } = opts(argv);
  const findings = await upstreamFindings(loadProvenance(PLUGIN_ROOT));
  if (values.json) print(findings);
  else if (!findings.length) print('Upstream sources and asserted versions are current.');
  else {
    const lines = [];
    for (const f of findings) {
      if (f.kind === 'upstream') {
        lines.push(`UPSTREAM ${f.source} (${f.repo}) is ${f.ahead} commits ahead of the baseline${f.truncated ? ' (file list truncated)' : ''}:`);
        for (const c of f.changed) lines.push(`  ${c.status.padEnd(9)} ${c.filename} (+${c.additions} -${c.deletions}) -> ${c.local}`);
      } else if (f.kind === 'release') lines.push(`RELEASE  ${f.pkg} latest ${f.latest} is outside ${f.requires}: re-check ${f.file} (${f.fact})`);
      else lines.push(`ERROR    ${f.source ?? f.fact}: ${f.message}`);
    }
    print(lines.join('\n'));
  }
  if (findings.length) process.exitCode = 1;
}

main().catch((err) => {
  if (err instanceof BatonError) {
    process.stderr.write(`baton: ${err.message}\n${err.hint ? `hint: ${err.hint}\n` : ''}`);
    process.exit(err.exitCode);
  }
  process.stderr.write(`baton: unexpected error\n${err.stack}\n`);
  process.exit(2);
});
