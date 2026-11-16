import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepMerge, BatonError, isPlainObject } from './util.mjs';
import { repoRoot } from './git.mjs';
import { GATES, STAGES } from './gates.mjs';

export const CONFIG_DIR = '.baton';
export const CONFIG_FILE = 'config.json';

export const BUILTIN_PHASES = ['spec', 'plan', 'backlog', 'implement', 'verify', 'review', 'integrate'];

export const KNOWN_STACKS = [
  'typescript',
  'javascript',
  'react',
  'node',
  'rust',
  'rust-tokio-postgres',
  'postgres',
  'api',
  'openapi',
  'i18n',
  'e2e',
];

// Registries a release can publish to (release.publish).
export const PUBLISH_TARGETS = ['npm', 'crates'];

// Loaded whenever any stack is enabled.
export const BASELINE_GUIDE = 'common';

// Reviewer briefs (reviewers/<name>.md). The general ones always run; the rest follow the stacks.
export const GENERAL_REVIEWERS = ['code-quality', 'security', 'tests', 'silent-failures'];
export const STACK_REVIEWERS = {
  typescript: ['typescript', 'types'],
  javascript: ['typescript'],
  node: ['typescript'],
  react: ['react', 'typescript'],
  rust: ['rust', 'types'],
  'rust-tokio-postgres': ['rust', 'postgres'],
  postgres: ['postgres'],
};

export const DEFAULT_CONFIG = {
  project: null,
  stacks: [],
  tasks: {
    provider: 'github',
    repo: null, // "owner/name"; null = infer from the git remote via gh
    labels: {
      ready: 'status:ready',
      inProgress: 'status:in-progress',
      review: 'status:review',
      blocked: 'status:blocked',
      priorityPrefix: 'priority:',
    },
  },
  git: {
    baseBranch: 'main',
    remote: 'origin',
    branchPrefix: 'task',
    worktreeRoot: '../{repo}-worktrees',
    mergeStrategy: 'squash',
  },
  // Commands run in every new task worktree before work starts (e.g. dependency install).
  setup: [],
  validate: [],
  // gates.skip: { "<gate>": "<reason>" } — catalog gates this repo deliberately doesn't run.
  gates: { skip: {} },
  workflow: {
    phases: ['spec', 'plan', 'backlog', 'implement', 'verify', 'review', 'integrate'],
    // Project-defined phases: { "<phase>": "<path to instructions .md, relative to repo root>" }
    custom: {},
    requireSpec: true,
    requireTdd: true,
    requireReview: true,
    // Run validation right after `baton start` so failures that predate the task are known.
    baselineOnStart: true,
  },
  review: {
    // Off by default: every enabled stack's reviewer runs on every change. On: skip a stack
    // reviewer only when the diff provably doesn't touch that stack (see reviewersFor).
    scopeToDiff: false,
  },
  hooks: {
    // Opt-in: block the first edit of each file per session until the agent states facts about it.
    factGate: false,
    // On: edits and commits in the main checkout are refused; all changes happen in linked worktrees.
    worktreeOnly: true,
  },
  // Opt-in: changelog and version generated at release by release-please; see baton:release.
  release: { enabled: false, publish: [] },
  docs: {
    specs: 'docs/specs',
    plans: 'docs/plans',
    // Recurring bug patterns, maintained by baton:retro and read before coding.
    commonIssues: 'docs/common-issues.md',
  },
  conventions: [], // project-specific rule files, relative to repo root
};

export function configPath(root) {
  return join(root, CONFIG_DIR, CONFIG_FILE);
}

/** Load the project config merged over defaults. `found` tells callers whether the repo opted in. */
export function loadConfig(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const path = configPath(root);
  if (!existsSync(path)) return { root, path, found: false, config: DEFAULT_CONFIG };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new BatonError(`Invalid JSON in ${path}: ${err.message}`);
  }
  const config = deepMerge(DEFAULT_CONFIG, raw);
  const problems = validateConfig(config);
  if (problems.length) {
    throw new BatonError(`Invalid ${path}:\n  - ${problems.join('\n  - ')}`);
  }
  return { root, path, found: true, config };
}

export function validateConfig(config) {
  const problems = [];
  if (!Array.isArray(config.stacks)) problems.push('stacks must be an array');
  else {
    for (const s of config.stacks) {
      if (!KNOWN_STACKS.includes(s)) problems.push(`unknown stack '${s}' (known: ${KNOWN_STACKS.join(', ')})`);
    }
  }
  if (config.tasks.provider !== 'github') problems.push(`tasks.provider '${config.tasks.provider}' is not supported yet (only 'github')`);
  for (const key of ['setup', 'validate']) {
    if (!Array.isArray(config[key])) problems.push(`${key} must be an array`);
    else {
      config[key].forEach((v, i) => {
        if (!v || typeof v.run !== 'string') problems.push(`${key}[${i}].run must be a string`);
      });
    }
  }
  problems.push(...validateGates(config));
  if (!Array.isArray(config.workflow.phases) || config.workflow.phases.length === 0) {
    problems.push('workflow.phases must be a non-empty array');
  } else {
    for (const phase of config.workflow.phases) {
      if (!BUILTIN_PHASES.includes(phase) && typeof config.workflow.custom?.[phase] !== 'string') {
        problems.push(`phase '${phase}' is not built in; add workflow.custom.${phase} pointing to an instructions file`);
      }
    }
  }
  if (!['squash', 'merge', 'rebase'].includes(config.git.mergeStrategy)) {
    problems.push(`git.mergeStrategy must be squash|merge|rebase`);
  }
  if (typeof config.hooks?.worktreeOnly !== 'boolean') problems.push('hooks.worktreeOnly must be a boolean');
  problems.push(...validateRelease(config));
  return problems;
}

function validateGates(config) {
  const problems = [];
  const skip = config.gates?.skip;
  if (!isPlainObject(skip)) return ['gates.skip must be an object'];
  for (const [gate, reason] of Object.entries(skip)) {
    if (!GATES.includes(gate)) problems.push(`gates.skip key '${gate}' is not a known gate (known: ${GATES.join(', ')})`);
    else if (typeof reason !== 'string' || !reason.trim()) problems.push(`gates.skip.${gate} must be a non-empty reason`);
    else if (/[\r\n]/.test(reason)) problems.push(`gates.skip.${gate} reason must not contain a newline`);
  }
  if (!Array.isArray(config.validate)) return problems;
  const seen = new Set();
  config.validate.forEach((v, i) => {
    if (!v || typeof v.run !== 'string') return;
    const name = v.name ?? v.run;
    const at = `validate[${i}] '${name}'`;
    if (seen.has(name)) problems.push(`${at}: duplicate step name`);
    seen.add(name);
    problems.push(...listProblems(at, 'gates', v.gates, GATES, 'gate'), ...listProblems(at, 'stages', v.stages, STAGES, 'stage'));
    if (v.blocking !== undefined && typeof v.blocking !== 'boolean') problems.push(`${at}: blocking must be a boolean`);
    if (v.blocking === false && (typeof v.reason !== 'string' || !v.reason.trim())) {
      problems.push(`${at}: reason is required when blocking is false`);
    }
    if (Array.isArray(v.gates)) {
      for (const g of v.gates) if (Object.hasOwn(skip, g)) problems.push(`${at}: gate '${g}' is both covered and skipped in gates.skip`);
    }
  });
  return problems;
}

function listProblems(at, key, list, known, noun) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return [`${at}: ${key} must be an array`];
  if (list.length === 0) return [`${at}: ${key} must be non-empty when present`];
  const problems = [];
  const seen = new Set();
  for (const item of list) {
    if (!known.includes(item)) problems.push(`${at}: unknown ${noun} '${item}' (known: ${known.join(', ')})`);
    else if (seen.has(item)) problems.push(`${at}: duplicate ${noun} '${item}'`);
    seen.add(item);
  }
  return problems;
}

function validateRelease(config) {
  const { release } = config;
  if (!isPlainObject(release)) return ['release must be an object'];
  const problems = [];
  if (typeof release.enabled !== 'boolean') problems.push('release.enabled must be a boolean');
  if (release.enabled === true && config.git.mergeStrategy !== 'squash') {
    problems.push('release.enabled requires git.mergeStrategy squash: every commit on the base branch must be a Conventional Commit.');
  }
  if (!Array.isArray(release.publish)) {
    problems.push('release.publish must be an array');
    return problems;
  }
  if (release.publish.length && release.enabled !== true) problems.push('release.publish requires release.enabled.');
  for (const target of release.publish) {
    if (!PUBLISH_TARGETS.includes(target)) problems.push(`unknown release.publish target '${target}' (known: ${PUBLISH_TARGETS.join(', ')}).`);
  }
  return problems;
}

// Files that belong to each stack. Used to skip stack reviewers a diff doesn't touch.
const JS_FILES = [/\.[cm]?[jt]sx?$/, /(^|\/)package\.json$/, /(^|\/)tsconfig[^/]*\.json$/];
const RUST_FILES = [/\.rs$/, /(^|\/)Cargo\.(toml|lock)$/];
export const STACK_PATHS = {
  typescript: JS_FILES,
  javascript: JS_FILES,
  node: JS_FILES,
  react: JS_FILES,
  rust: RUST_FILES,
  'rust-tokio-postgres': RUST_FILES,
  // SQL often lives inside Rust code, so Rust changes also get the Postgres review.
  postgres: [/\.sql$/, /(^|\/)migrations\//, /\.rs$/],
};
// Files no stack reviewer needs to see (docs, images, repo metadata).
const NEUTRAL_FILES = /\.(md|mdx|txt|png|jpe?g|gif|svg|webp|ico)$|(^|\/)(LICENSE|NOTICE|\.gitignore|\.gitattributes)$/;
// Changes to the workflow itself (config, agent setup, CI) never reduce review.
const WORKFLOW_FILES = /(^|\/)(\.baton|\.claude|\.github)\//;
// SQL written inside application code (strings in .ts/.rs files) still needs the Postgres review.
const SQL_IN_CODE = /\b(SELECT\b[\s\S]{0,300}?\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|POLICY)|ALTER\s+TABLE)\b/i;

/**
 * Reviewer briefs to dispatch, spec compliance first. Without `changedFiles` every reviewer for
 * the enabled stacks runs (the default). With it, a stack reviewer is skipped only when the diff
 * provably doesn't touch its stack: no file of that stack, no unclassified file, no change to
 * the workflow files and, for Postgres, no SQL in the diff text.
 */
export function reviewersFor(config, changedFiles, diffText = '') {
  const names = new Set(GENERAL_REVIEWERS);
  const unknown = changedFiles?.some((f) => !NEUTRAL_FILES.test(f) && !config.stacks.some((s) => STACK_PATHS[s]?.some((re) => re.test(f))));
  const all = !changedFiles || unknown || changedFiles.some((f) => WORKFLOW_FILES.test(f));
  for (const s of config.stacks) {
    const touched =
      all ||
      changedFiles.some((f) => STACK_PATHS[s]?.some((re) => re.test(f)) ?? true) ||
      (s === 'postgres' && SQL_IN_CODE.test(diffText));
    if (touched) for (const r of STACK_REVIEWERS[s] ?? []) names.add(r);
  }
  return ['spec-compliance', ...names];
}

/** Changed files each stack reviewer should focus on (all changed files for general reviewers). */
export function reviewerFocus(config, name, changedFiles) {
  const stacks = config.stacks.filter((s) => (STACK_REVIEWERS[s] ?? []).includes(name));
  if (!changedFiles || !stacks.length) return changedFiles;
  const mine = changedFiles.filter((f) => stacks.some((s) => STACK_PATHS[s]?.some((re) => re.test(f))));
  return mine.length ? mine : changedFiles;
}
