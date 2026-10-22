#!/usr/bin/env node
// baton: deterministic operations for the baton workflow.
// Skills tell the agent *when* to do something; this CLI does it the same way every time.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configPath, DEFAULT_CONFIG, loadConfig, CONFIG_DIR, reviewerFocus, reviewersFor } from './lib/config.mjs';
import { buildContext } from './lib/context.mjs';
import { detectStacks, suggestSetup, suggestValidate } from './lib/detect.mjs';
import {
  branchName,
  currentBranch,
  currentTop,
  git,
  hasUncommittedChanges,
  issueFromBranch,
  listWorktrees,
  repoRoot,
  worktreeBase,
} from './lib/git.mjs';
import { getProvider } from './lib/providers/github.mjs';
import { factsVsInstalled, installedVersions, loadProvenance, upstreamFindings } from './lib/provenance.mjs';
import { labelNames, parseDependencies, prBody, rankClaimable, reviewState, statusOf, unblockable } from './lib/tasks.mjs';
import { BatonError, print, runShell } from './lib/util.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `baton <command> [options]

Setup
  init [--force] [--labels]        Create .baton/config.json (detects stacks); --labels also creates GitHub labels
  labels                           Create/update status and priority labels on GitHub
  config                           Print the resolved config
  context                          Print the session context the hook injects

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
  worktree list | remove <n> [--force] | prune
  status                           Local worktrees and the tasks they belong to

Integration
  verify [--only NAME]             Run the project's validation commands in the current checkout
  reviewers [--all]                Reviewer briefs to dispatch, with the changed files each should focus on
  done [--draft] [--title T] [--body-file F] [--skip-review REASON]
                                   Verify, push and open a PR for the current task, mark it review.
                                   With requireReview, the body must hold `Reviewed-at: <HEAD sha>`

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
  await fn(rest);
}

function opts(argv, options = {}) {
  return parseArgs({
    args: argv,
    options: { json: { type: 'boolean' }, ...options },
    allowPositionals: true,
  });
}

function issueArg(positionals, i = 0) {
  const n = Number(String(positionals[i] ?? '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) throw new BatonError('Expected a task number, e.g. `baton claim 42`');
  return n;
}

function requireConfig() {
  const loaded = loadConfig();
  if (!loaded.found) throw new BatonError('No .baton/config.json in this repo', { hint: 'Run `baton init` first.' });
  return loaded;
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
  const path = configPath(root);
  if (existsSync(path) && !values.force) {
    throw new BatonError(`${relative(root, path)} already exists`, { hint: 'Use --force to overwrite.' });
  }
  const detected = detectStacks(root);
  const baseBranch = detectBaseBranch(root);
  const config = {
    project: root.split('/').pop(),
    stacks: detected.stacks,
    tasks: { provider: 'github', repo: null },
    git: { baseBranch, branchPrefix: DEFAULT_CONFIG.git.branchPrefix, worktreeRoot: DEFAULT_CONFIG.git.worktreeRoot, mergeStrategy: 'squash' },
    setup: suggestSetup(detected),
    validate: suggestValidate(detected, { remote: DEFAULT_CONFIG.git.remote, baseBranch }),
    workflow: DEFAULT_CONFIG.workflow,
    hooks: DEFAULT_CONFIG.hooks,
    docs: DEFAULT_CONFIG.docs,
    conventions: [],
  };
  mkdirSync(join(root, CONFIG_DIR), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  for (const d of [config.docs.specs, config.docs.plans]) mkdirSync(join(root, d), { recursive: true });
  if (values.labels) getProvider(loadConfig().config, root).ensureLabels();
  print(values.json ? config : `Wrote ${relative(root, path)}\n${JSON.stringify(config, null, 2)}`);
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
  return rows
    .map((r) => `#${String(r.number).padEnd(5)} ${r.status.padEnd(12)} ${(r.assignees.join(',') || '-').padEnd(14)} ${r.title}`)
    .join('\n');
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

/** This branch's changes vs the base branch, or undefined if git can't tell (then nothing is skipped). */
function branchDiff(config) {
  const { remote, baseBranch } = config.git;
  for (const base of [`${remote}/${baseBranch}`, baseBranch]) {
    const names = git(['diff', '--name-only', `${base}...HEAD`], { allowFail: true });
    if (names.code !== 0) continue;
    const text = git(['diff', '--unified=0', `${base}...HEAD`], { allowFail: true });
    return { files: names.stdout ? names.stdout.split('\n') : [], text: text.code === 0 ? text.stdout : '' };
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
  const path = createWorktree(root, config, n, res.task.title);

  const setup = runSteps(config.setup, path, 'setup');
  if (!setup.ok) {
    throw new BatonError(`Setup failed in ${path}`, { hint: 'Fix the setup step (see output above), then rerun `baton start`. The claim and worktree are kept.' });
  }
  const baseline = config.workflow.baselineOnStart && !values['no-baseline'] ? runSteps(config.validate, path, 'baseline') : null;

  const branch = currentBranch(path);
  if (values.json) return print({ number: n, path, branch, baseline: baseline && { ok: baseline.ok, results: baseline.results } });
  const lines = [`Task #${n} ready in ${path}`, `branch: ${branch}`];
  if (baseline && !baseline.ok) {
    const failed = baseline.results.at(-1);
    lines.push(`baseline: '${failed.name}' ALREADY FAILS before any change. Report it; don't count it against this task or "fix" it silently.`);
  } else if (baseline) lines.push('baseline: validation passes before any change.');
  lines.push('Next: work only inside that directory.');
  print(lines.join('\n'));
}

function createWorktree(root, config, n, title) {
  const existing = listWorktrees(root).find((w) => issueFromBranch(config, w.branch) === n);
  if (existing) return existing.path;
  const branch = branchName(config, n, title);
  const path = join(worktreeBase(root, config), branch.replace(/\//g, '-'));
  const { remote, baseBranch } = config.git;
  git(['fetch', remote, baseBranch], { cwd: root, allowFail: true });
  const remoteBase = git(['rev-parse', '--verify', '--quiet', `${remote}/${baseBranch}`], { cwd: root, allowFail: true });
  const base = remoteBase.code === 0 ? `${remote}/${baseBranch}` : baseBranch;
  const localBranch = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root, allowFail: true });
  mkdirSync(dirname(path), { recursive: true });
  if (localBranch.code === 0) git(['worktree', 'add', path, branch], { cwd: root });
  else git(['worktree', 'add', '--no-track', '-b', branch, path, base], { cwd: root });
  return path;
}

function worktree(argv) {
  const [sub, ...rest] = argv;
  const { values, positionals } = opts(rest, { force: { type: 'boolean' } });
  const { root, config } = requireConfig();
  if (sub === 'list' || !sub) {
    const rows = listWorktrees(root).map((w) => ({ ...w, task: issueFromBranch(config, w.branch) }));
    if (values.json) return print(rows);
    return print(rows.map((w) => `${w.task ? `#${w.task}`.padEnd(7) : '-'.padEnd(7)} ${w.branch ?? '(detached)'}  ${w.path}`).join('\n'));
  }
  if (sub === 'remove') {
    const n = issueArg(positionals);
    const wt = listWorktrees(root).find((w) => issueFromBranch(config, w.branch) === n);
    if (!wt) throw new BatonError(`No worktree for #${n}`);
    if (!values.force && hasUncommittedChanges(wt.path)) {
      throw new BatonError(`Worktree for #${n} has uncommitted changes`, { hint: 'Commit or discard them, or pass --force.' });
    }
    git(['worktree', 'remove', ...(values.force ? ['--force'] : []), wt.path], { cwd: root });
    return print(`Removed worktree ${wt.path} (branch ${wt.branch} kept).`);
  }
  if (sub === 'prune') {
    git(['worktree', 'prune'], { cwd: root });
    return print('Pruned stale worktree records.');
  }
  throw new BatonError(`Unknown worktree subcommand '${sub}'`);
}

function status(argv) {
  const { values } = opts(argv);
  const { root, config } = requireConfig();
  const here = currentTop();
  const rows = listWorktrees(root)
    .map((w) => ({ task: issueFromBranch(config, w.branch), branch: w.branch, path: w.path, current: w.path === here, dirty: hasUncommittedChanges(w.path) }))
    .filter((w) => w.task);
  if (values.json) return print(rows);
  print(rows.length ? rows.map((r) => `${r.current ? '*' : ' '} #${r.task} ${r.branch}${r.dirty ? ' (uncommitted)' : ''}\n    ${r.path}`).join('\n') : 'No task worktrees.');
}

// --- Integration ----------------------------------------------------------

/** Run configured steps ({ name, run, cwd? }) in order, stopping at the first failure. Output goes to stderr. */
function runSteps(steps, top, label) {
  const results = [];
  for (const step of steps) {
    const name = step.name ?? step.run;
    process.stderr.write(`\n▶ [${label}] ${name}: ${step.run}\n`);
    const code = runShell(step.run, { cwd: step.cwd ? join(top, step.cwd) : top, stdout: 'stderr' });
    results.push({ name, run: step.run, code });
    if (code !== 0) {
      process.stderr.write(`✖ ${name} failed (exit ${code})\n`);
      return { ok: false, results };
    }
    process.stderr.write(`✔ ${name}\n`);
  }
  return { ok: true, results };
}

function runValidation(config, top, only) {
  const steps = config.validate.filter((v) => !only || v.name === only);
  if (!steps.length) {
    process.stderr.write(only ? `No validation step named '${only}'.\n` : 'No validation commands configured (.baton/config.json "validate").\n');
    return { ok: !only, results: [] };
  }
  return runSteps(steps, top, 'verify');
}

function verify(argv) {
  const { values } = opts(argv, { only: { type: 'string' } });
  const { config } = requireConfig();
  const res = runValidation(config, currentTop(), values.only);
  if (values.json) print(res);
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

  // Review gate: a draft PR may precede review; a ready PR needs a review of exactly this commit,
  // or an explicit, visible reason for skipping it.
  if (config.workflow.requireReview && !values.draft) {
    if (values['skip-review']) {
      extra = `${extra.trim()}\n\n**Review skipped:** ${values['skip-review']}\n`;
    } else {
      const state = reviewState(extra, git(['rev-parse', 'HEAD'], { cwd: top }).stdout);
      if (!state.ok) {
        throw new BatonError(`Not reviewed: ${state.reason}`, {
          hint: 'Run baton:review on the current HEAD, put `Reviewed-at: <sha>` in the Reviews section of --body-file, or pass --draft / --skip-review "<reason>".',
        });
      }
    }
  }

  const res = runValidation(config, top);
  if (!res.ok) throw new BatonError('Validation failed; not opening a PR.');

  const provider = getProvider(config, root);
  const branch = currentBranch(top);
  // Task branches have a single owner (the claimant), so a lease-protected force push
  // after a rebase is safe; it still refuses if someone else pushed to the branch.
  git(['push', '--force-with-lease', '-u', config.git.remote, branch], { cwd: top });
  const task = provider.get(n);
  let pr = provider.findPullRequest(branch);
  if (!pr) {
    const body = prBody(n, extra, res.results);
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
  if (!loaded.found) findings.push({ kind: 'config', message: 'No .baton/config.json (run `baton init`)' });
  const { root, config } = loaded;

  for (const step of [...config.setup, ...config.validate]) {
    const tool = step.run.trim().split(/\s+/)[0];
    if (!/^[\w.-]+$/.test(tool)) continue;
    if (runShell(`command -v ${tool} >/dev/null 2>&1`) !== 0) findings.push({ kind: 'tool', message: `'${tool}' (used by '${step.name ?? step.run}') is not on PATH` });
    if (step.cwd && !existsSync(join(root, step.cwd))) findings.push({ kind: 'config', message: `cwd '${step.cwd}' of '${step.name ?? step.run}' does not exist` });
  }
  const notEnabled = detectStacks(root).stacks.filter((s) => !config.stacks.includes(s));
  if (notEnabled.length) findings.push({ kind: 'stacks', message: `Detected but not enabled: ${notEnabled.join(', ')}` });

  for (const f of factsVsInstalled(loadProvenance(PLUGIN_ROOT), installedVersions(root))) {
    findings.push({ ...f, message: `${f.pkg.replace(/^\w+:/, '')} ${f.installed} installed, but ${f.file} assumes ${f.requires} (${f.fact}). Upgrade, or record the exception in the project conventions.` });
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
