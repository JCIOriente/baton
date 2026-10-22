import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepMerge, BatonError } from './util.mjs';
import { repoRoot } from './git.mjs';

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
  },
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
